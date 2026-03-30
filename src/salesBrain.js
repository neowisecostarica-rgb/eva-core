/*
====================================================
EVA CORE — SALES BRAIN (STRATEGY ENABLED)
====================================================
*/

import {
  findOrCreateLead,
  findOrCreateConversation,
  saveMessage,
} from "./db.js";

import db from "./db.js";

import { searchCatalogSmart } from "./brain/utils/catalogEngine.js";
import { generateReply } from "./brain/replies/replyEngine.js";

import { enforceAIRuntime } from "./system/contracts/aiRuntime.js";
import { runAI } from "./brain/engines/aiEngine.js";
import { applyAIGuards } from "./brain/utils/aiGuards.js";
import { buildPrompt } from "./brain/utils/promptBuilder.js";
import { getPromptConfig } from "./brain/utils/getPromptConfig.js";

/*
====================================================
NEW — INTENT + STAGE + STRATEGY
====================================================
*/

function detectIntent(text = "") {
  const t = text.toLowerCase();

  if (t.includes("precio") || t.includes("cuánto") || t.includes("cuanto"))
    return "BUY";

  if (t.includes("comprar") || t.includes("lo quiero"))
    return "BUY";

  if (t.includes("mantenimiento") || t.includes("reparar"))
    return "SERVICE";

  if (t.includes("hola") || t.includes("buenas"))
    return "GREETING";

  return "INFO";
}

function detectStage({ history = [], signals }) {
  if (signals?.interest_level === "high") return "HOT";
  if (signals?.interest_level === "medium") return "MID";
  if (history.length > 2) return "QUALIFYING";
  return "EARLY";
}

function decideStrategy({ intent, stage, known_data }) {
  if (intent === "SERVICE" && !known_data?.problem) return "ASK";
  if (intent === "SERVICE" && known_data?.problem)
    return "EXPLAIN_CLOSE";

  if (intent === "BUY" && stage === "EARLY") return "QUALIFY";
  if (intent === "BUY" && stage === "MID") return "RECOMMEND";
  if (intent === "BUY" && stage === "HOT") return "CLOSE";

  if (intent === "GREETING") return "ASK";

  return "DEFAULT";
}

/*
====================================================
HELPERS
====================================================
*/

function extractSignalsFromText(text = "") {
  const lower = text.toLowerCase();

  let use_case = null;
  let budget = null;
  let interest_level = "low";
  let lastUserIntent = "general";

  if (lower.includes("estudio")) use_case = "study";
  if (lower.includes("trabajo")) use_case = "work";

  if (
    lower.includes("precio") ||
    lower.includes("cuánto") ||
    lower.includes("cuanto")
  ) {
    lastUserIntent = "price_check";
    interest_level = "medium";
  }

  if (lower.includes("comprar") || lower.includes("lo quiero")) {
    lastUserIntent = "buy_intent";
    interest_level = "high";
  }

  return {
    use_case,
    budget,
    interest_level,
    lastUserIntent,
  };
}

function buildCustomerMemory({ lead, signals, history = [] }) {
  return {
    isReturningUser: history.length > 2,
    use_case: signals.use_case,
    budget: signals.budget,
    interest_level: signals.interest_level,
    lastUserIntent: signals.lastUserIntent,
    lead_stage: lead?.stage || "new",
    lead_status: lead?.status || "active",
  };
}

/*
====================================================
MAIN HANDLER
====================================================
*/

export async function handleInbound(payload) {
  try {
    const {
      organization_id,
      phone,
      text,
      channel,
      message_id,
    } = payload;

    console.log("🧠 [Brain] Processing:", { phone, text });

    /*
    ========================================
    0. IDEMPOTENCY
    ========================================
    */

    if (message_id) {
      const existing = await db.query(
        `SELECT id FROM messages
         WHERE organization_id = $1
         AND external_message_id = $2 LIMIT 1`,
        [organization_id, message_id]
      );

      if (existing.rows.length > 0) {
        return {
          reply: { text: null, media: [] },
          meta: { duplicate: true },
        };
      }
    }

    /*
    ========================================
    1. LEAD + CONVERSATION
    ========================================
    */

    const lead = await findOrCreateLead({ organization_id, phone });

    const conversation = await findOrCreateConversation({
      organization_id,
      phone,
      channel,
      lead_id: lead?.id,
    });

    /*
    ========================================
    2. SAVE USER MESSAGE
    ========================================
    */

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      lead_id: lead?.id,
      role: "user",
      text,
      message_id,
    });

    /*
    ========================================
    3. HISTORY
    ========================================
    */

    const historyRes = await db.query(
      `SELECT role, content AS text
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC LIMIT 10`,
      [conversation.id]
    );

    const history = historyRes.rows || [];

    /*
    ========================================
    4. SIGNALS + MEMORY
    ========================================
    */

    const signals = extractSignalsFromText(text);

    const memory = buildCustomerMemory({
      lead,
      signals,
      history,
    });

    /*
    ========================================
    5. INTENT + STAGE + STRATEGY
    ========================================
    */

    const intent = detectIntent(text);

    const stage = detectStage({
      history,
      signals,
    });

    const known_data = {
      use_case: signals.use_case,
      budget: signals.budget,
    };

    const strategy = decideStrategy({
      intent,
      stage,
      known_data,
    });

    /*
    ========================================
    6. CONTEXT
    ========================================
    */

    const context = {
      organization_id,
      phone,
      text,
      intent,
      stage,
      strategy,
      known_data,
    };

    /*
    ========================================
    7. CATALOG
    ========================================
    */

    let catalogResults = [];

    try {
      catalogResults = await searchCatalogSmart({
        organization_id,
        query: text,
      });
    } catch (err) {
      console.warn("⚠️ Catalog error:", err);
    }

    const safeCatalog =
      strategy === "RECOMMEND" || strategy === "CLOSE"
        ? catalogResults.slice(0, 1)
        : [];

    /*
    ========================================
    8. CONFIG
    ========================================
    */

    const config = await getPromptConfig(organization_id);

    /*
    ========================================
    9. AI
    ========================================
    */

    let aiText = null;

    try {
      const prompt = buildPrompt({
        context,
        catalogResults: safeCatalog,
        history,
        memory,
        config,
        salesMode: strategy, // compatibilidad
      });

      const aiResult = await runAI({ prompt });

      enforceAIRuntime({
        aiResponse: aiResult,
        source: "openai",
      });

      const guarded = applyAIGuards({
        aiResponse: aiResult,
        context,
      });

      if (guarded?.text) {
        aiText = guarded.text;
      }
    } catch (err) {
      console.warn("⚠️ AI error:", err);
    }

    /*
    ========================================
    10. FALLBACK
    ========================================
    */

    let replyText = aiText;

    if (!replyText) {
      replyText =
        "Hola 😊 con mucho gusto le ayudo. Contame un poco más qué está buscando y le guío.";
    }

    /*
    ========================================
    11. RESPONSE
    ========================================
    */

    const reply = generateReply({
      text: replyText,
      intent: "AI",
      products: aiText ? safeCatalog : [],
    });

    /*
    ========================================
    12. SAVE
    ========================================
    */

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      lead_id: lead?.id,
      role: "assistant",
      text: reply.text,
    });

    return {
      reply,
      meta: {
        intent,
        stage,
        strategy,
        usedAI: !!aiText,
      },
    };
  } catch (err) {
    console.error("❌ SALES BRAIN ERROR:", err);

    return {
      reply: {
        text: "Hubo un problema procesando el mensaje, intentemos nuevamente 🙏",
        media: [],
      },
      meta: {
        error: true,
      },
    };
  }
}

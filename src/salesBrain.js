/*
====================================================
EVA CORE — SALES BRAIN (FINAL CONTROLLED VERSION)
SOURCE OF TRUTH — NO PATCH ZONE
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
HELPERS — SIGNALS + MEMORY + CONTEXT
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

function buildConversationContext({
  organization_id,
  phone,
  text,
  channel,
  message_id,
  lead,
  signals,
  salesMode,
}) {
  return {
    organization_id,
    phone,
    text,
    channel,
    message_id,
    lead_id: lead?.id || null,
    stage: lead?.stage || "new",
    salesMode,
    signals,
    timestamp: new Date().toISOString(),
  };
}

function isUserQualified(text, history = []) {
  const t = (text || "").toLowerCase().trim();

  const genericInputs = ["trabajo", "estudio", "uso básico", "uso basico"];

  if (genericInputs.includes(t)) return false;
  if (history.length >= 2) return true;
  if (t.length > 20) return true;

  return false;
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
        `SELECT id FROM messages WHERE organization_id = $1 AND external_message_id = $2 LIMIT 1`,
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

    if (!lead) {
      throw new Error("Lead could not be created or loaded");
    }

    const conversation = await findOrCreateConversation({
      organization_id,
      phone,
      channel,
      lead_id: lead?.id,
    });

    if (!conversation) {
      throw new Error("Conversation could not be created or loaded");
    }

    /*
    ========================================
    2. SAVE MESSAGE
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
      `SELECT role, content as text
       FROM messages
       WHERE conversation_id = $1
       AND organization_id = $2
       ORDER BY created_at ASC
       LIMIT 10`,
      [conversation.id, organization_id]
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
    5. QUALIFICATION
    ========================================
    */

    const qualified = isUserQualified(text, history);

    /*
    ========================================
    6. SALES MODE
    ========================================
    */

    const lower = (text || "").toLowerCase();

    let salesMode = "conversation";

    if (!qualified) {
      salesMode = "discovery";
    } else if (
      lower.includes("precio") ||
      lower.includes("cuánto") ||
      lower.includes("cuanto")
    ) {
      salesMode = "closing";
    } else {
      salesMode = "recommendation";
    }

    /*
    ========================================
    7. CONTEXT
    ========================================
    */

    const context = buildConversationContext({
      organization_id,
      phone,
      text,
      channel,
      message_id,
      lead,
      signals,
      salesMode,
    });

    /*
    ========================================
    8. CATÁLOGO
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

    const safeCatalog = qualified
      ? Array.isArray(catalogResults)
        ? catalogResults.slice(0, 1)
        : []
      : [];

    /*
    ========================================
    9. CONFIG
    ========================================
    */

    const config = await getPromptConfig(organization_id);

    /*
    ========================================
    10. AI
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
        salesMode,
      });

      enforceAIRuntime(prompt);

      const aiResult = await runAI({
        prompt,
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
    11. FALLBACK MÍNIMO
    ========================================
    */

    let replyText = aiText;

    if (!replyText) {
      console.log("⚠️ AI FALLBACK ACTIVATED");

      replyText =
        "Hola 😊 con mucho gusto le ayudo. Contame un poco más qué está buscando y le guío.";
    }

    /*
    ========================================
    12. RESPONSE LAYER (COMERCIAL)
    ========================================
    */

    const reply = generateReply({
  text: replyText,
  intent: "AI",
  products: aiText ? safeCatalog : [],
});

    /*
    ========================================
    13. SAVE RESPONSE
    ========================================
    */

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      lead_id: lead?.id,
      role: "assistant",
      text: reply.text,
    });

    /*
    ========================================
    14. RETURN
    ========================================
    */

    return {
      reply,
      meta: {
        salesMode,
        qualified,
        usedAI: !!aiText,
        fallback: !aiText,
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

/*
====================================================
EVA CORE — SALES BRAIN (BRAIN BLOCK FIXED)
====================================================
*/

import {
  findOrCreateLead,
  findOrCreateConversation,
  saveMessage,
  savePipelineEvent,
} from "./db.js";

import db from "./db.js";

import { searchCatalogSmart } from "./brain/utils/catalogEngine.js";
import { generateReply } from "./brain/replies/replyEngine.js";

import { enforceAIRuntime } from "./system/contracts/aiRuntime.js";
import { runAI } from "./brain/engines/aiEngine.js";
import { applyAIGuards } from "./brain/utils/aiGuards.js";
import { buildPrompt } from "./brain/utils/promptBuilder.js";
import { getPromptConfig } from "./brain/utils/getPromptConfig.js";

/* ✅ FIX: usar engines, no intent */
import { detectPipelineEvent } from "./brain/engines/pipelineEngine.js";
import { detectIntent } from "./brain/engines/intentEngine.js";

/*
====================================================
BRAIN HELPERS
====================================================
*/

function normalizeStage(stage) {
  const safeStage = String(stage || "new").toLowerCase();

  if (
    safeStage === "new" ||
    safeStage === "early"
  ) return "new";

  if (
    safeStage === "qualifying"
  ) return "qualifying";

  if (
    safeStage === "consideration" ||
    safeStage === "mid"
  ) return "consideration";

  if (
    safeStage === "hot" ||
    safeStage === "ready_to_buy"
  ) return "hot";

  if (
    safeStage === "closing"
  ) return "closing";

  if (
    safeStage === "post"
  ) return "post";

  return "new";
}

function buildKnownData({ text, lead, history }) {
  return {
    last_message: text || "",
    lead_stage: lead?.stage || "new",
    history_count: Array.isArray(history) ? history.length : 0,
    has_history: Array.isArray(history) && history.length > 0,
  };
}

function decideStrategy({ intent, stage, known_data }) {
  const safeIntent = String(intent || "OTHER").toUpperCase();
  const safeStage = normalizeStage(stage);
  const data = known_data || {};

  // ====================================================
  // SERVICE
  // ====================================================
  if (safeIntent === "SERVICE") {
    if (!data.problem) return "ASK";
    return "EXPLAIN_CLOSE";
  }

  // ====================================================
  // BUY / CLOSE
  // ====================================================
  if (safeIntent === "BUY" || safeIntent === "CLOSE_INTENT") {
    if (safeStage === "new") return "QUALIFY";
    if (safeStage === "qualifying") return "QUALIFY";
    if (safeStage === "consideration") return "RECOMMEND";
    if (safeStage === "hot") return "CLOSE";
    if (safeStage === "closing") return "CLOSE";
    return "QUALIFY";
  }

  // ====================================================
  // FOLLOWUP
  // ====================================================
  if (safeIntent === "FOLLOWUP") {
    return "FOLLOWUP";
  }

  // ====================================================
  // INFO
  // ====================================================
  if (safeIntent === "INFO") {
    return "EXPLAIN";
  }

  // ====================================================
  // GREETING
  // ====================================================
  if (safeIntent === "GREETING") {
    return "ASK";
  }

  // ====================================================
  // DEFAULT
  // ====================================================
  return "ASK";
}

function buildContext({
  organization_id,
  phone,
  text,
  intent,
  stage,
  strategy,
  history,
  known_data,
  config,
}) {
  return {
    organization_id,
    phone,
    text,
    intent,
    stage,
    strategy,
    history,
    known_data,
    config: config || null,
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
         AND external_message_id = $2
         LIMIT 1`,
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
    });

    /*
    ========================================
    2. SAVE USER MESSAGE
    ========================================
    */

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
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
       ORDER BY created_at ASC
       LIMIT 10`,
      [conversation.id]
    );

    const history = historyRes.rows || [];

    /*
    ========================================
    4. INTENT + PIPELINE
    ========================================
    */

    const intent = detectIntent(text);
    const pipelineEvent = detectPipelineEvent(text);

    if (pipelineEvent && lead?.id) {
      await savePipelineEvent({
        organization_id,
        lead_id: lead.id,
        event_type: pipelineEvent,
        metadata: { text, intent },
      });
    }

    /*
    ========================================
    5. STAGE ENGINE
    ========================================
    */

    let newStage = normalizeStage(lead.stage);

    if (pipelineEvent === "PRICE_REQUEST") newStage = "qualifying";
    if (pipelineEvent === "CATALOG_REQUEST") newStage = "consideration";
    if (pipelineEvent === "READY_TO_BUY") newStage = "hot";
    if (pipelineEvent === "PAYMENT_INTENT") newStage = "closing";

    if (newStage !== normalizeStage(lead.stage)) {
      await db.query(
        `UPDATE leads
         SET stage = $1, updated_at = NOW()
         WHERE id = $2
         AND organization_id = $3`,
        [newStage, lead.id, organization_id]
      );

      lead.stage = newStage;
    } else {
      lead.stage = normalizeStage(lead.stage);
    }

    /*
    ========================================
    6. CONFIG
    ========================================
    */

    const config = await getPromptConfig(organization_id);

    /*
    ========================================
    7. KNOWN DATA + STRATEGY
    ========================================
    */

    const known_data = buildKnownData({
      text,
      lead,
      history,
    });

    const strategy = decideStrategy({
      intent,
      stage: lead.stage,
      known_data,
    });

    console.log("🧠 STRATEGY:", strategy);

    /*
    ========================================
    8. CONTEXT
    ========================================
    */

    const context = buildContext({
      organization_id,
      phone,
      text,
      intent,
      stage: lead.stage,
      strategy,
      history,
      known_data,
      config,
    });

    /*
    ========================================
    9. CATALOG
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
    10. AI
    ========================================
    */

    let aiText = null;

    try {
      const prompt = buildPrompt({
        context,
        catalogResults: safeCatalog,
        history,
        config,
        salesMode: strategy,
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
    11. FALLBACK
    ========================================
    */

    let replyText =
      aiText ||
      "Hola 😊 con mucho gusto le ayudo. ¿Qué tipo de uso le quiere dar al equipo?";

    /*
    ========================================
    12. RESPONSE
    ========================================
    */

    const reply = generateReply({
      text: replyText,
      intent: "AI",
      products: aiText ? safeCatalog : [],
    });

    /*
    ========================================
    13. SAVE ASSISTANT MESSAGE
    ========================================
    */

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      text: reply.text,
    });

    return {
      reply,
      meta: {
        intent,
        stage: lead.stage,
        strategy,
        pipelineEvent,
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
      meta: { error: true },
    };
  }
}

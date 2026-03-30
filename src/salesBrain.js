/*
====================================================
EVA CORE — SALES BRAIN (FIXED + CLEAN)
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
    });

    /*
    ========================================
    2. SAVE USER MESSAGE (FIX)
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
       ORDER BY created_at ASC LIMIT 10`,
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
    5. STAGE ENGINE (FIX REAL)
    ========================================
    */

    let newStage = lead.stage || "new";

    if (pipelineEvent === "PRICE_REQUEST") newStage = "qualifying";
    if (pipelineEvent === "CATALOG_REQUEST") newStage = "consideration";
    if (pipelineEvent === "READY_TO_BUY") newStage = "hot";
    if (pipelineEvent === "PAYMENT_INTENT") newStage = "closing";

    if (newStage !== lead.stage) {
      await db.query(
        `UPDATE leads
         SET stage = $1, updated_at = NOW()
         WHERE id = $2 AND organization_id = $3`,
        [newStage, lead.id, organization_id]
      );

      lead.stage = newStage;
    }

    /*
    ========================================
    6. STRATEGY ENGINE (FIX)
    ========================================
    */

    let strategy = "ASK";

    if (intent === "BUY") {
      if (lead.stage === "new") strategy = "QUALIFY";
      else if (lead.stage === "qualifying") strategy = "QUALIFY";
      else if (lead.stage === "consideration") strategy = "RECOMMEND";
      else if (lead.stage === "hot") strategy = "CLOSE";
      else if (lead.stage === "closing") strategy = "CLOSE";
    }

    if (intent === "CLOSE_INTENT") strategy = "CLOSE";

    /*
    ========================================
    7. CONTEXT
    ========================================
    */

    const context = {
      organization_id,
      phone,
      text,
      intent,
      stage: lead.stage,
      strategy,
    };

    /*
    ========================================
    8. CATALOG
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

      if (guarded?.text) aiText = guarded.text;
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
    13. SAVE
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

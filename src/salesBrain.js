/*
====================================================
EVA CORE — SALES BRAIN (FINAL STABLE MVP)
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

import { enforceAIRuntime } from "./system/contracts/aiRuntime.js";
import { runAI } from "./brain/engines/aiEngine.js";
import { applyAIGuards } from "./brain/utils/aiGuards.js";
import { buildPrompt } from "./brain/utils/promptBuilder.js";
import { getPromptConfig } from "./brain/utils/getPromptConfig.js";

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
    0. IDEMPOTENCY (HARD GUARD)
    ========================================
    */

    if (message_id) {
      try {
        const existing = await db.query(
          `
          SELECT id
          FROM messages
          WHERE organization_id = $1
          AND external_message_id = $2
          LIMIT 1
          `,
          [organization_id, message_id]
        );

        if (existing.rows.length > 0) {
          console.log("⚠️ Duplicate message skipped:", message_id);

          return {
            reply: { text: null },
            meta: { duplicate: true },
          };
        }
      } catch (err) {
        console.warn("⚠️ Idempotency error:", err);
      }
    }

    /*
    ========================================
    1. LEAD
    ========================================
    */

    let lead = null;

    try {
      lead = await findOrCreateLead({
        organization_id,
        phone,
      });
    } catch (err) {
      console.error("❌ Lead error:", err);
    }

    /*
    ========================================
    2. CONVERSATION
    ========================================
    */

    let conversation = null;

    try {
      conversation = await findOrCreateConversation({
        organization_id,
        phone,
        channel,
        lead_id: lead?.id,
      });
    } catch (err) {
      console.error("❌ Conversation error:", err);
    }

    /*
    ========================================
    3. SAVE USER MESSAGE
    ========================================
    */

    if (conversation?.id) {
      await saveMessage({
        organization_id,
        conversation_id: conversation.id,
        lead_id: lead?.id,
        role: "user",
        text,
        message_id,
      });
    }

    /*
    ========================================
    4. HISTORY
    ========================================
    */

    let history = [];

    try {
      if (conversation?.id) {
        const result = await db.query(
          `
          SELECT role, content as text
          FROM messages
          WHERE conversation_id = $1
          AND organization_id = $2
          ORDER BY created_at ASC
          LIMIT 10
          `,
          [conversation.id, organization_id]
        );

        history = result.rows;
      }
    } catch (err) {
      console.warn("⚠️ History error:", err);
    }

    /*
    ========================================
    5. CONTEXT (SOURCE OF TRUTH)
    ========================================
    */

    const context = {
      organization_id,
      phone,
      text,
      channel,
      message_id,
      lead_id: lead?.id || null,
      timestamp: new Date().toISOString(),
    };

    /*
    ========================================
    6. CATÁLOGO
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

    /*
    ========================================
    7. SALES MODE (MVP CONTROLLED)
    ========================================
    */

    const lower = (text || "").toLowerCase();

    let salesMode = "conversation";

    if (
      lower.includes("precio") ||
      lower.includes("cuánto") ||
      lower.includes("cuanto") ||
      lower.includes("vale") ||
      lower.includes("disponible") ||
      lower.includes("tienen")
    ) {
      salesMode = "closing";
    } else if (
      lower.includes("busco") ||
      lower.includes("necesito") ||
      lower.includes("quiero")
    ) {
      salesMode = "discovery";
    }

    let safeCatalog = [];

    if (salesMode === "closing") {
      safeCatalog = catalogResults;
    }

    if (salesMode === "discovery") {
      safeCatalog = catalogResults.slice(0, 2);
    }

    /*
    ========================================
    8. CONFIG
    ========================================
    */

    let config = {};

    try {
      config = await getPromptConfig(organization_id);
    } catch (err) {
      console.warn("⚠️ Config error:", err);
    }

    /*
    ========================================
    9. AI (SINGLE ENTRY POINT)
    ========================================
    */

    let replyText = null;
    let usedAI = false;

    try {
      const prompt = buildPrompt({
        context,
        catalogResults: safeCatalog,
        history,
        config,
        salesMode,
      });

      const aiResponse = await runAI({
        prompt, // 🔒 ÚNICO CONTRATO
      });

      const guarded = applyAIGuards({
        aiResponse,
        context,
      });

      enforceAIRuntime({
        aiResponse: guarded,
        source: "salesBrain",
      });

      if (guarded && typeof guarded.text === "string" && guarded.text.trim().length > 0) {
        replyText = guarded.text.trim();
        usedAI = true;
      }

    } catch (err) {
      console.warn("⚠️ AI error:", err);
    }

    /*
    ========================================
    10. FALLBACK (HARD SAFE)
    ========================================
    */

    if (!replyText) {
      replyText =
        "Hola 😊 con gusto te ayudo. Contame un poco más qué estás buscando y te guío.";
    }

    /*
    ========================================
    11. SAVE ASSISTANT MESSAGE
    ========================================
    */

    if (conversation?.id && replyText) {
      try {
        await saveMessage({
          organization_id,
          conversation_id: conversation.id,
          lead_id: lead?.id,
          role: "assistant",
          text: replyText,
        });
      } catch (err) {
        console.warn("⚠️ Save assistant error:", err);
      }
    }

    /*
    ========================================
    12. FINAL RESPONSE (CONTRACT GUARANTEED)
    ========================================
    */

    return {
      reply: {
        text: replyText,
        products: safeCatalog,
      },
      meta: {
        organization_id,
        channel,
        phone,
        lead_id: lead?.id || null,
        usedAI,
      },
    };

  } catch (err) {
    console.error("❌ FATAL salesBrain:", err);

    return {
      reply: {
        text: "Disculpá 🙏 tuvimos un problema. Intentá de nuevo en un momento.",
      },
      meta: {
        error: true,
      },
    };
  }
}

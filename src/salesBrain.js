import { findOrCreateLead, findOrCreateConversation, saveMessage } from "./db.js";
import db from "./db.js";
import { searchCatalogSmart } from "./brain/utils/catalogEngine.js";

import { enforceAIRuntime } from "./system/contracts/aiRuntime.js";
import { runAI } from "./brain/engines/aiEngine.js";
import { applyAIGuards } from "./brain/utils/aiGuards.js";
import { buildPrompt } from "./brain/utils/promptBuilder.js";
import { getPromptConfig } from "./brain/utils/getPromptConfig.js";

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
    1.1 CONVERSATION
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
    1.2 SAVE USER MESSAGE
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
    2. HISTORY
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
    3. CONTEXT
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
    4. CATÁLOGO
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
    🔥 4.1 CONTROL DE INTENCIÓN (FIX REAL)
    ========================================
    */

    const lower = (text || "").toLowerCase();

    const isGreeting =
      lower.includes("hola") ||
      lower.includes("buenas") ||
      lower.length <= 5;

    const isGratitude =
      lower.includes("gracias");

    const allowSelling = !isGreeting && !isGratitude;

    // 🔒 FILTRAR CATÁLOGO
    const safeCatalog = allowSelling ? catalogResults : [];

    /*
    ========================================
    5. CONFIG
    ========================================
    */

    const config = await getPromptConfig(organization_id);

    /*
    ========================================
    6. AI
    ========================================
    */

    let replyText = null;

    try {
      const prompt = buildPrompt({
        context,
        catalogResults: safeCatalog,
        history,
        config,
      });

      const aiResponse = await runAI({
        context,
        catalogResults: safeCatalog,
        prompt,
      });

      const guarded = applyAIGuards({
        aiResponse,
        context,
      });

      enforceAIRuntime({
        aiResponse: guarded,
        source: "salesBrain",
      });

      if (guarded?.text) {
        replyText = guarded.text;
      }
    } catch (err) {
      console.warn("⚠️ AI error:", err);
    }

    /*
    ========================================
    7. FALLBACK
    ========================================
    */

    if (!replyText) {
      replyText =
        "Hola 😊 con gusto te ayudo. Contame un poco más qué estás buscando y te guío.";
    }

    /*
    ========================================
    8. SAVE ASSISTANT
    ========================================
    */

    if (conversation?.id && replyText) {
      await saveMessage({
        organization_id,
        conversation_id: conversation.id,
        lead_id: lead?.id,
        role: "assistant",
        text: replyText,
      });
    }

    /*
    ========================================
    9. RESPONSE
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
        usedAI: true,
      },
    };
  } catch (err) {
    console.error("❌ ERROR salesBrain:", err);

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

// src/salesBrain.js

import { findOrCreateLead, findOrCreateConversation, saveMessage } from "./db.js";
import db from "./db.js";
import { searchCatalogSmart } from "./brain/utils/catalogEngine.js";
import { generateReply } from "./brain/replies/replyEngine.js";

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
0. IDEMPOTENCY CHECK (CRÍTICO)
========================================
*/

if (message_id) {
  try {
    const existing = await db.query(
      `SELECT id FROM messages WHERE message_id = $1 LIMIT 1`,
      [message_id]
    );

    if (existing.rows.length > 0) {
      console.log("⚠️ Duplicate message skipped:", message_id);

      return {
        reply: {
          text: null
        },
        meta: {
          duplicate: true
        }
      };
    }
  } catch (err) {
    console.warn("⚠️ Idempotency check error:", err);
  }
}
    
    /*
    ========================================
    1. LEAD (SOURCE OF TRUTH CRM)
    ========================================
    */

    let lead = null;

    try {
      lead = await findOrCreateLead({
        organization_id,
        phone,
      });

      console.log("👤 Lead:", lead?.id);
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
        lead_id: lead?.id
      });

      console.log("💬 Conversation:", conversation?.id);
    } catch (err) {
      console.error("❌ Conversation error:", err);
    }

    /*
    ========================================
    1.2 SAVE USER MESSAGE (ANTES DEL AI)
    ========================================
    */

    if (conversation?.id) {
      await saveMessage({
        organization_id,
        conversation_id: conversation.id,
        lead_id: lead?.id,
        role: "user",
        text,
        message_id
      });
    }

    /*
========================================
2.1 LOAD CONVERSATION HISTORY (BÁSICO)
========================================
*/

let history = [];

try {
  if (conversation?.id) {
    const result = await db.query(
      `
     SELECT role, content as text FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
      LIMIT 10
      `,
      [conversation.id]
    );

    history = result.rows;
    console.log("🧠 History loaded:", history.length);
  }
} catch (err) {
  console.warn("⚠️ History load error:", err);
}
    
    /*
    ========================================
    2. CONTEXTO BASE
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
    3. CATÁLOGO
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
    4. CONFIG
    ========================================
    */

    const config = await getPromptConfig(organization_id);

    /*
    ========================================
    5. AI
    ========================================
    */

    let aiText = null;

    try {
     const prompt = buildPrompt({
  context,
  catalogResults,
  history,
  config,
});

      const aiResponse = await runAI({
        context,
        catalogResults,
        prompt,
      });

      const guarded = applyAIGuards({
        aiResponse,
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
5.5 HANDOFF DETECTION (BÁSICO)
========================================
*/

const needsHuman = !catalogResults || catalogResults.length === 0;

if (needsHuman) {
  console.log("🚨 HANDOFF SUGGESTED:", {
    organization_id,
    phone,
    text,
    reason: "no_catalog_match"
  });

  /*
  ========================================
  🛑 OVERRIDE COMERCIAL (CRÍTICO)
  ========================================
  */

  return {
    reply: generateReply({
      text: `Hola 😊 claro que sí, con gusto te ayudo 🙌

Trabajamos ese tipo de producto.

¿Lo estás buscando para estudio, trabajo o algo más específico? 👍
Así te recomiendo la mejor opción según lo que necesités.`,
      intent: "GUIDED_SALE",
      products: [],
    }),
    meta: {
      organization_id,
      channel,
      phone,
      lead_id: lead?.id || null,
      usedAI: false,
      fallback: false,
      guided: true,
    },
  };
}
    
    /*
    ========================================
    6. FALLBACK
    ========================================
    */

    let replyText = aiText;

    if (!replyText) {
      console.log("⚠️ AI FALLBACK ACTIVATED");

      replyText =
        "Hola 😊 con gusto te ayudo. Contame un poco más qué estás buscando y te guío.";
    }

    /*
    ========================================
    6.1 SAVE ASSISTANT MESSAGE
    ========================================
    */

    if (conversation?.id && replyText) {
      await saveMessage({
        organization_id,
        conversation_id: conversation.id,
        lead_id: lead?.id,
        role: "assistant",
        text: replyText
      });
    }

    /*
    ========================================
    7. RESPONSE
    ========================================
    */

    const reply = generateReply({
      text: replyText,
      intent: "AI",
      products: catalogResults,
    });

    /*
    ========================================
    8. META
    ========================================
    */

    const meta = {
      organization_id,
      channel,
      phone,
      lead_id: lead?.id || null,
      usedAI: !!aiText,
      fallback: !aiText,
    };

    /*
    ========================================
    9. RETURN
    ========================================
    */

    return {
      reply,
      meta,
    };

  } catch (err) {
    console.error("❌ ERROR salesBrain:", err);

    return {
      reply: {
        text: "Disculpá 🙏 tuvimos un problema. Intentá de nuevo en un momento.",
        media: [],
      },
      meta: {
        error: true,
      },
    };
  }
}

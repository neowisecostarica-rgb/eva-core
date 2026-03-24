// src/salesBrain.js

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
    1. CONTEXTO BASE
    ========================================
    */

    const context = {
      organization_id,
      phone,
      text,
      channel,
      message_id,
      timestamp: new Date().toISOString(),
    };

    /*
    ========================================
    2. CATÁLOGO (SIEMPRE DISPONIBLE PARA AI)
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
    3. CONFIG
    ========================================
    */

    const config = await getPromptConfig(organization_id);

    /*
    ========================================
    4. AI (CORE)
    ========================================
    */

    let aiText = null;

    try {
      const prompt = buildPrompt({
        context,
        catalogResults,
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
    5. FALLBACK MÍNIMO (SOLO SEGURIDAD)
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
    6. RESPONSE
    ========================================
    */

    const reply = generateReply({
      text: replyText,
      intent: "AI",
      products: catalogResults,
    });

    /*
    ========================================
    7. META
    ========================================
    */

    const meta = {
      organization_id,
      channel,
      phone,
      usedAI: !!aiText,
      fallback: !aiText,
    };

    /*
    ========================================
    8. RETURN
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

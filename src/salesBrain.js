// src/salesBrain.js

import { searchCatalogSmart } from "./brain/utils/catalogEngine.js";
import { generateReply } from "./brain/replies/replyEngine.js";

import { runAI } from "./brain/engines/aiEngine.js";
import { applyAIGuards } from "./brain/utils/aiGuards.js";
import { buildPrompt } from "./brain/utils/promptBuilder.js";
import { getPromptConfig } from "./brain/utils/getPromptConfig.js"; // ✅ FIX AQUÍ

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
    2. DETECCIÓN BÁSICA (FALLBACK)
    ========================================
    */

    const lowerText = text.toLowerCase();

    let intent = "UNKNOWN";

    if (lowerText.includes("hola") || lowerText.includes("buenas")) {
      intent = "GREETING";
    } else if (lowerText.includes("precio") || lowerText.includes("cuesta")) {
      intent = "PRICE";
    } else if (
      lowerText.includes("laptop") ||
      lowerText.includes("computadora")
    ) {
      intent = "PRODUCT_SEARCH";
    }

    /*
    ========================================
    3. CATÁLOGO
    ========================================
    */

    let catalogResults = [];

    if (intent === "PRODUCT_SEARCH" || intent === "PRICE") {
      catalogResults = await searchCatalogSmart({
        organization_id,
        query: text,
      });
    }

    /*
    ========================================
    4. CONFIG (TEMPORAL)
    ========================================
    */

    const config = await getPromptConfig(organization_id);

    /*
    ========================================
    5. INTENTO AI
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
      console.warn("⚠️ AI fallback activado:", err);
    }

    /*
    ========================================
    6. FALLBACK (SI AI FALLA)
    ========================================
    */

    let replyText = aiText;

    if (!replyText) {
      console.log("🧠 Using fallback logic");

      if (intent === "GREETING") {
        replyText =
          "Hola 😊 con gusto te ayudo, ¿qué estás buscando exactamente?";
      }

      if (intent === "PRODUCT_SEARCH" && catalogResults.length > 0) {
        replyText = `Claro 🙌 te puedo recomendar estas opciones:\n\n${catalogResults
          .slice(0, 3)
          .map((p, i) => `${i + 1}. ${p.name} — ₡${p.price}`)
          .join("\n")}`;
      }

      if (!replyText) {
        replyText =
          "Claro 😊 contame un poco más qué estás buscando y con gusto te ayudo a encontrar la mejor opción 🙌";
      }
    }

    /*
    ========================================
    7. BUILD RESPONSE
    ========================================
    */

    const reply = generateReply({
  text: replyText,
  intent,
  products: catalogResults,
});

    /*
    ========================================
    8. META
    ========================================
    */

    const meta = {
      organization_id,
      intent,
      channel,
      phone,
      usedAI: !!aiText,
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
        text: "Disculpá 🙏 tuvimos un problema, intentá de nuevo en un momento.",
        media: [],
      },
      meta: {
        error: true,
      },
    };
  }
}

// src/salesBrain.js

import { searchCatalogSmart } from "./brain/utils/catalogEngine.js";
import { buildReply } from "./brain/replies/replyEngine.js";

// 🔥 (FUTURO / SIGUIENTE PASO)
// import { runAI } from "./brain/engines/aiEngine.js";
// import { applyAIGuards } from "./brain/utils/aiGuards.js";

export async function handleInbound(payload) {
  try {
    const {
      organization_id,
      phone,
      text,
      channel,
      message_id,
    } = payload;

    console.log("🧠 [Brain] Processing message:", {
      phone,
      text,
      organization_id,
    });

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
    2. DETECCIÓN BÁSICA (NO AI)
    ========================================
    */

    const lowerText = text.toLowerCase();

    let intent = "UNKNOWN";

    if (lowerText.includes("hola") || lowerText.includes("buenas")) {
      intent = "GREETING";
    } else if (lowerText.includes("precio") || lowerText.includes("cuesta")) {
      intent = "PRICE";
    } else if (lowerText.includes("laptop") || lowerText.includes("computadora")) {
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
    4. DECISIÓN COMERCIAL
    ========================================
    */

    let stage = "DISCOVERY";

    if (intent === "PRODUCT_SEARCH") {
      stage = "QUALIFYING";
    }

    /*
    ========================================
    5. RESPUESTA (NO AI TODAVÍA)
    ========================================
    */

    let replyText = "";

    if (intent === "GREETING") {
      replyText = "Hola 😊 con gusto te ayudo, ¿qué estás buscando exactamente?";
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

    /*
    ========================================
    6. BUILD FINAL RESPONSE
    ========================================
    */

    const reply = buildReply({
      text: replyText,
      media: [],
    });

    /*
    ========================================
    7. META (PARA FUTURO CRM / ANALYTICS)
    ========================================
    */

    const meta = {
      organization_id,
      intent,
      stage,
      channel,
      phone,
    };

    /*
    ========================================
    8. RETURN FINAL
    ========================================
    */

    return {
      reply,
      meta,
    };
  } catch (err) {
    console.error("❌ ERROR en salesBrain:", err);

    return {
      reply: {
        text: "Disculpá 🙏 tuvimos un problema procesando tu mensaje, intentá de nuevo en un momento.",
        media: [],
      },
      meta: {
        error: true,
      },
    };
  }
}

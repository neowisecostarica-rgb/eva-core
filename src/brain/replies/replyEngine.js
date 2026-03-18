console.log("🔥 USING REPLY ENGINE HARDENED 🔥");

/*
====================================================
EVA REPLY ENGINE (HARDENED + NO SILENCE)
====================================================
*/

import { extractProductImages } from "../engines/mediaEngine.js";
import { enhanceReply } from "../engines/aiEnhancer.js";

/*
====================================================
HELPERS
====================================================
*/

function formatPrice(value) {
  if (!value) return "Consultar precio";
  const numberValue = Number(value);
  if (Number.isNaN(numberValue)) return "Consultar precio";
  return `₡${numberValue.toLocaleString()}`;
}

function getMainCatalogItem(catalogMatches = []) {
  return Array.isArray(catalogMatches) && catalogMatches.length > 0
    ? catalogMatches[0]
    : null;
}

function buildResponse(text, product = null) {
  return {
    text,
    media: product ? extractProductImages(product) : []
  };
}

/*
====================================================
SMART FALLBACK (NUNCA SILENCIO)
====================================================
*/

function smartFallbackReply({ text = "", stage = "new" } = {}) {

  const normalized = String(text).toLowerCase();

  if (
    normalized.includes("hola") ||
    normalized.includes("buenas") ||
    normalized.includes("hello")
  ) {
    return buildResponse(
      "Hola 🙌\nTe atiende Eva de Compu Store Costa Rica.\n\n¿Buscas computadora para estudio o trabajo?"
    );
  }

  if (
    normalized.includes("precio") ||
    normalized.includes("cuanto") ||
    normalized.includes("vale")
  ) {
    return buildResponse(
      "Con gusto 🙌\n\n¿Me indicas qué tipo de equipo buscas para darte opciones exactas?"
    );
  }

  return buildResponse(
    "Con gusto te ayudo 🙌\n\n¿Buscas laptop para estudio, trabajo o algo más específico?"
  );
}

/*
====================================================
PRODUCT RESPONSE (OPTIMIZADO PARA CIERRE)
====================================================
*/

function productReply({ catalogMatches = [], interestLevel = null }) {

  const item = getMainCatalogItem(catalogMatches);

  if (!item) {
    return null; // importante → deja que fallback actúe
  }

  const price = formatPrice(item.price_crc);

  /*
  ====================================================
  HIGH INTENT → CIERRE DIRECTO
  ====================================================
  */

  if (interestLevel === "HIGH") {
    return buildResponse(
      `Esta es de las opciones más buscadas 👇

💻 ${item.name}
💰 ${price}

✅ Línea corporativa
✅ SSD rápido
✅ 1 año de garantía

Nos quedan pocas unidades disponibles.

Puedes apartarla con ₡20.000 para asegurarla 🙌

¿Te la reservo o prefieres ver fotos reales primero?`,
      item
    );
  }

  /*
  ====================================================
  LOW INTENT → EMPUJE SUAVE
  ====================================================
  */

  return buildResponse(
    `Te recomiendo esta opción 👇

💻 ${item.name}
💰 ${price}

Son equipos empresariales, más duraderos que muchos nuevos domésticos.

Si quieres te ayudo a asegurar una unidad disponible 🙌

¿La ocuparías para estudio o trabajo?`,
    item
  );
}

/*
====================================================
MAIN REPLY ENGINE
====================================================
*/

export async function generateReply({
  text = "",
  intent = "UNKNOWN",
  stage = "new",
  catalogMatches = [],
  interestLevel = null
}) {

  try {

    let response = null;

    /*
    ====================================================
    PRIORIDAD 1 — PRODUCTO
    ====================================================
    */
    if (catalogMatches && catalogMatches.length > 0) {
      response = productReply({ catalogMatches, interestLevel });
    }

    /*
    ====================================================
    PRIORIDAD 2 — FALLBACK (SI NO HAY PRODUCTO)
    ====================================================
    */
    if (!response) {
      response = smartFallbackReply({ text, stage });
    }

    /*
    ====================================================
    SEGURIDAD: NUNCA RESPUESTA VACÍA
    ====================================================
    */
    if (!response || !response.text) {
      response = {
        text: "Con gusto te ayudo 🙌",
        media: []
      };
    }

    /*
    ====================================================
    AI ENHANCER (NO CRÍTICO)
    ====================================================
    */
    try {
      const enhanced = await enhanceReply({
        text: response.text,
        intent,
        stage
      });

      if (enhanced) {
        response.text = enhanced;
      }
    } catch (err) {
      console.warn("⚠️ aiEnhancer falló, usando texto base");
    }

    return response;

  } catch (err) {

    console.error("❌ reply engine error:", err.message);

    return {
      text: "Hubo un pequeño problema 🙏 pero con gusto te ayudo.\n\n¿Buscas laptop para estudio o trabajo?",
      media: []
    };

  }
}

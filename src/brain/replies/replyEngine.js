console.log("🔥 USING REPLY ENGINE CORRECTO 🔥");

/*
====================================================
EVA REPLY ENGINE (HARDENED VERSION)
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

function buildProductResponse(text, product = null) {
  return {
    text,
    media: product ? extractProductImages(product) : []
  };
}

/*
====================================================
SMART FALLBACK
====================================================
*/

function smartFallbackReply({ stage = "new", products = [] } = {}) {
  if (Array.isArray(products) && products.length > 0) {
    return {
      text: `Perfecto 🙌

Tengo opciones disponibles para ti.

Cuéntame, ¿Para qué la estarías usando? (estudio, trabajo, algo más exigente)`,
      media: []
    };
  }

  if (
    stage === "qualified_work" ||
    stage === "qualified_study" ||
    stage === "catalog_shown"
  ) {
    return {
      text: `Perfecto 🙌

Cuéntame qué tipo de equipo buscas y con gusto te recomiendo una opción disponible 👌`,
      media: []
    };
  }

  return {
    text: `Perfecto 🙌

Cuéntame qué estás buscando y te ayudo 👌`,
    media: []
  };
}

/*
====================================================
GREETING
====================================================
*/

function greetingReply() {
  return {
    text: `Hola 🙌

Te atiende *Eva de Compu Store Costa Rica*.

Tenemos laptops de línea corporativa con excelente rendimiento y garantía 👌

¿La necesitas para *estudio o trabajo*?`,
    media: []
  };
}

/*
====================================================
PRODUCT REPLY
====================================================
*/

function productReply({
  catalogMatches = [],
  interestLevel = null,
  stage = "new"
}) {
  const item = getMainCatalogItem(catalogMatches);

  if (!item) {
    return smartFallbackReply({
      stage,
      products: catalogMatches
    });
  }

  const price = formatPrice(item.price_crc);

  // 🔥 Si ya estamos en flujo comercial, no reiniciar la conversación
  if (
    stage === "catalog_shown" ||
    stage === "qualified_work" ||
    stage === "qualified_study"
  ) {
    return buildProductResponse(`Perfecto 🙌

💻 ${item.name}
💰 ${price}

Es una excelente opción según lo que buscas.

¿Te gustaría ver fotos reales o prefieres apartarla?`, item);
  }

  if (interestLevel === "HIGH") {
    return buildProductResponse(`Esta opción es de las más buscadas 👇

💻 ${item.name}
💰 ${price}

✅ Línea corporativa
✅ SSD rápido
✅ 1 año de garantía

Tenemos pocas unidades.

Puedes apartarla con ₡20.000 🙌

Es de las que más rápido se van.

Si quieres, te la puedo apartar con ₡20.000 para asegurártela 🙌

¿Te la reservo?`, item);
  }

  return buildProductResponse(`Te recomiendo esta opción 👇

💻 ${item.name}
💰 ${price}

¿La necesitas para estudio o trabajo?`, item);
}

/*
====================================================
BUY FLOW
====================================================
*/

function buyReplyByStage({ catalogMatches = [], stage = "new" }) {
  const item = getMainCatalogItem(catalogMatches);

  if (!item) {
    return smartFallbackReply({ stage, products: catalogMatches });
  }

  const price = formatPrice(item.price_crc);

  return buildProductResponse(`Perfecto 🙌

💻 ${item.name}
💰 ${price}

La puedes apartar con ₡20.000 y asegurarla.

¿Prefieres SINPE, transferencia o tarjeta?

/*
====================================================
FALLBACK (CONTROLADO)
====================================================
*/

function fallbackReply() {
  return {
    text: `Perfecto 🙌

Cuéntame qué estás buscando y te ayudo 👌`,
    media: []
  };
}

/*
====================================================
MAIN
====================================================
*/

export async function generateReply({
  intent,
  catalogMatches,
  interestLevel,
  objection,
  closingIntent,
  score,
  stage
}) {
  let response;

  try {
    // 🟢 Greeting solo si no hay contexto
    if (intent === "GREETING" && (!catalogMatches || catalogMatches.length === 0)) {
      response = greetingReply();
    }

    // 🟢 Compra
    else if (intent === "BUY") {
      response = buyReplyByStage({ catalogMatches, stage });
    }

    // 🟢 Producto encontrado
    else if (Array.isArray(catalogMatches) && catalogMatches.length > 0) {
      response = productReply({ catalogMatches, interestLevel, stage });
    }

    // 🔴 Catálogo vacío → fallback inteligente
    else if (Array.isArray(catalogMatches) && catalogMatches.length === 0) {
      console.log("CATALOG EMPTY → SMART FALLBACK");
      response = smartFallbackReply({ stage, products: catalogMatches });
    }

    // 🔴 Cualquier otro caso raro
    else {
      console.log("UNKNOWN CASE → FALLBACK");
      response = fallbackReply();
    }
  } catch (err) {
    console.error("REPLY ENGINE HARD ERROR:", err);

    // 🔥 fallback crítico de sistema
    response = smartFallbackReply({ stage, products: catalogMatches });
  }

  /*
  ====================================================
  AI ENHANCEMENT (NO ROMPE EL SISTEMA)
  ====================================================
  */

  try {
    if (response?.text) {
      response.text = await enhanceReply(response.text);
    }
  } catch (err) {
    console.error("reply ai enhance error", err);
  }

  return response;
}

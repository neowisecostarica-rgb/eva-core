/*
====================================================
EVA REPLY ENGINE (FIXED VERSION)
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
  return catalogMatches?.[0] || null;
}

function buildProductResponse(text, product = null) {
  return {
    text,
    media: product ? extractProductImages(product) : []
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

function productReply({ catalogMatches = [], interestLevel = null }) {

  const item = getMainCatalogItem(catalogMatches);

  if (!item) {
    return {
      text: `En este momento no encontré exactamente ese modelo 🙌

Cuéntame para qué la necesitas y te recomiendo la mejor opción.`,
      media: []
    };
  }

  const price = formatPrice(item.price_crc);

  if (interestLevel === "HIGH") {
    return buildProductResponse(`Esta opción es de las más buscadas 👇

💻 ${item.name}
💰 ${price}

✅ Línea corporativa
✅ SSD rápido
✅ 1 año de garantía

Tenemos pocas unidades.

Puedes apartarla con ₡20.000 🙌

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
    return {
      text: `Perfecto 🙌

¿La necesitas para estudio o trabajo?`,
      media: []
    };
  }

  const price = formatPrice(item.price_crc);

  return buildProductResponse(`Perfecto 🙌

💻 ${item.name}
💰 ${price}

Puedes apartarla con ₡20.000.

¿Te paso los datos?`, item);

}

/*
====================================================
FALLBACK
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

  if (intent === "GREETING") {
    response = greetingReply();
  }

  else if (intent === "BUY") {
    response = buyReplyByStage({ catalogMatches, stage });
  }

  // 🔥 CLAVE: SI HAY PRODUCTOS → USARLOS
  else if (catalogMatches && catalogMatches.length > 0) {
    response = productReply({ catalogMatches, interestLevel });
  }

  else {
    response = fallbackReply();
  }

  try {
    if (response?.text) {
      response.text = await enhanceReply(response.text);
    }
  } catch (err) {
    console.error("reply ai enhance error", err);
  }

  return response;

}

/*
====================================================
EVA REPLY ENGINE (HARDENED SAFE VERSION)
====================================================
*/

import { extractProductImages } from "../engines/mediaEngine.js";

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

function getMainCatalogItem(products = []) {
  return Array.isArray(products) && products.length > 0
    ? products[0]
    : null;
}

function safeExtractMedia(product) {
  try {
    if (!product) return [];

    const media = extractProductImages(product);

    if (!Array.isArray(media)) return [];

    return media;

  } catch (err) {
    console.error("❌ MEDIA ERROR:", err.message);
    return [];
  }
}

function buildResponse(text, product = null) {
  return {
    text,
    media: safeExtractMedia(product)
  };
}

/*
====================================================
SMART FALLBACK
====================================================
*/

function smartFallbackReply() {
  return buildResponse("Claro 😊 contame un poco más qué estás buscando y te ayudo 🙌");
}

/*
====================================================
PRODUCT REPLY (VENTAS)
====================================================
*/

function productReply({ products = [], intent = "UNKNOWN", text = "" }) {

  const item = getMainCatalogItem(products);

  if (!item) {
    return smartFallbackReply();
  }

  const name = item.name || "Equipo disponible";
  const price = formatPrice(item.price_crc);

  /*
  ============================================
  HIGH INTENT (COMPRA)
  ============================================
  */

  if (intent === "BUY") {
    return buildResponse(`Esta opción es de las más buscadas 👇

💻 ${name}
💰 ${price}

✅ Línea corporativa
✅ SSD rápido
✅ 1 año de garantía

Nos quedan pocas unidades.

Puedes apartarla con ₡20.000 🙌

¿Te la reservo?`, item);
  }

  /*
  ============================================
  PRICE INTENT
  ============================================
  */

  if (intent === "PRICE") {
    return buildResponse(`Claro 🙌 te comparto una opción 👇

💻 ${name}
💰 ${price}

Es una excelente opción para trabajo y estudio.

Si quieres te envío fotos reales o te ayudo a reservar una.`, item);
  }

  /*
  ============================================
  PRODUCT SEARCH
  ============================================
  */

  if (intent === "PRODUCT_SEARCH") {
    return buildResponse(`Tenemos esta opción disponible 👇

💻 ${name}
💰 ${price}

¿La estarías usando para estudio o trabajo?`, item);
  }

  /*
  ============================================
  DEFAULT
  ============================================
  */

  return buildResponse(`Te recomiendo esta opción 👇

💻 ${name}
💰 ${price}

¿La necesitas para estudio o trabajo?`, item);
}

/*
====================================================
MAIN EXPORT
====================================================
*/

export function generateReply({
  text = "",
  intent = "UNKNOWN",
  products = []
}) {

  console.log("🧠 GENERATE REPLY:", {
    text,
    intent,
    products_count: products?.length || 0
  });

  /*
  PRIORIDAD: PRODUCTOS
  */

  if (products && products.length > 0) {
    return productReply({ products, intent, text });
  }

  /*
  FALLBACK
  */

  return smartFallbackReply();
}

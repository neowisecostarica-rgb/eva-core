/*
====================================================
EVA REPLY ENGINE (CLEAN STABLE VERSION)
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
SMART FALLBACK
====================================================
*/

function smartFallbackReply() {
  return buildResponse("Gracias por escribirnos 🙌");
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

  const price = formatPrice(item.price_crc);

  /*
  ============================================
  HIGH INTENT (COMPRA)
  ============================================
  */

  if (intent === "BUY") {
    return buildResponse(`Esta opción es de las más buscadas 👇

💻 ${item.name}
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

💻 ${item.name}
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

💻 ${item.name}
💰 ${price}

¿La estarías usando para estudio o trabajo?`, item);
  }

  /*
  ============================================
  DEFAULT
  ============================================
  */

  return buildResponse(`Te recomiendo esta opción 👇

💻 ${item.name}
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

  console.log("🧠 GENERATE REPLY:", { text, intent, products });

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

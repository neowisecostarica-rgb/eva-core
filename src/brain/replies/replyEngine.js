/*
====================================================
EVA REPLY ENGINE (AI-FIRST VERSION)
====================================================
*/

import { extractProductImages } from "../engines/mediaEngine.js";

/*
====================================================
HELPERS
====================================================
*/

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

function getMainCatalogItem(products = []) {
  return Array.isArray(products) && products.length > 0
    ? products[0]
    : null;
}

/*
====================================================
MAIN EXPORT
====================================================
*/

export function generateReply({
  text = "",
  intent = "AI",
  products = []
}) {

  console.log("🧠 GENERATE REPLY:", {
    text,
    intent,
    products_count: products?.length || 0
  });

  /*
  ============================================
  1. SI HAY TEXTO (AI) → USARLO
  ============================================
  */

  if (text && text.trim().length > 0) {
    const mainProduct = getMainCatalogItem(products);

    return {
      text,
      media: safeExtractMedia(mainProduct)
    };
  }

  /*
  ============================================
  2. FALLBACK MÍNIMO (SOLO SEGURIDAD)
  ============================================
  */

  return {
    text: "Hola 😊 contame un poco más qué estás buscando y te ayudo.",
    media: []
  };
}

/*
====================================================
EVA REPLY ENGINE (AI-FIRST + SALES OPTIMIZED)
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

function formatPrice(price) {
  if (!price) return "";
  return `₡${Number(price).toLocaleString("es-CR")}`;
}

function formatProducts(products = []) {
  if (!products.length) return "";

  return products
    .slice(0, 2)
    .map(p => {
      return `💻 ${p.name}
${formatPrice(p.price)}`;
    })
    .join("\n\n");
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
    intent,
    products_count: products?.length || 0
  });

  const mainProduct = getMainCatalogItem(products);

  /*
  ============================================
  1. SI HAY TEXTO AI → MEJORARLO (NO REEMPLAZAR)
  ============================================
  */

  if (text && text.trim().length > 0) {
    let finalText = text;

    if (products && products.length > 0) {
      finalText += `\n\n${formatProducts(products)}\n\n¿Te interesa alguna o querés que te recomiende mejor según tu uso? 👍`;
    }

    return {
      text: finalText,
      media: safeExtractMedia(mainProduct)
    };
  }

  /*
  ============================================
  2. SIN AI → RESPUESTA COMERCIAL DIRECTA
  ============================================
  */

  if (products && products.length > 0) {
    return {
      text: `Hola 😊 claro que sí 🙌

Te recomiendo estas opciones 👇

${formatProducts(products)}

Son equipos corporativos reacondicionados, muy duraderos y con garantía 👌

¿Buscás algo para estudio, trabajo o uso más avanzado? 👍`,
      media: safeExtractMedia(mainProduct)
    };
  }

  /*
  ============================================
  3. FALLBACK
  ============================================
  */

  return {
    text: "Hola 😊 contame un poco más qué estás buscando y te ayudo.",
    media: []
  };
}

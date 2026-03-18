/*
====================================================
EVA REPLY ENGINE (CLOSING + OBJECTIONS)
====================================================
*/

import { extractProductImages } from "../engines/mediaEngine.js";

/*
====================================================
HELPERS
====================================================
*/

function formatPrice(value) {
  if (value === null || value === undefined || value === "") {
    return "Consultar precio";
  }

  const numberValue = Number(value);

  if (Number.isNaN(numberValue)) {
    return "Consultar precio";
  }

  return `₡${numberValue.toLocaleString()}`;
}

function getMainCatalogItem(catalogMatches = []) {
  if (!Array.isArray(catalogMatches) || !catalogMatches.length) {
    return null;
  }
  return catalogMatches[0];
}

function buildResponse(text, product = null) {
  return {
    text,
    media: product ? extractProductImages(product) : []
  };
}

/*
====================================================
OBJECTION DETECTION
====================================================
*/

function detectObjection(text = "") {
  const t = text.toLowerCase();

  if (t.includes("caro") || t.includes("mucho")) return "PRICE";

  if (
    t.includes("pensar") ||
    t.includes("luego") ||
    t.includes("despues")
  ) return "DOUBT";

  if (
    t.includes("garantia") ||
    t.includes("nuevo") ||
    t.includes("sirve")
  ) return "TRUST";

  if (
    t.includes("barato") ||
    t.includes("otra opcion") ||
    t.includes("mas opciones")
  ) return "COMPARISON";

  return null;
}

/*
====================================================
OBJECTION RESPONSES
====================================================
*/

function objectionReply(type) {
  switch (type) {

    case "PRICE":
      return {
        text: `Entiendo totalmente 🙌

Estos equipos son línea corporativa, diseñados para durar mucho más que laptops domésticas.

Incluyen SSD y 1 año de garantía, por eso mantienen ese valor.

Igual puedo ayudarte a encontrar algo que se ajuste mejor a tu presupuesto 👇

¿En qué rango andas?`,
        media: []
      };

    case "DOUBT":
      return {
        text: `Claro 🙌

Solo te comento que estos equipos suelen moverse rápido porque son muy buscados.

Si quieres, puedo apartarte uno sin compromiso mientras decides.`,
        media: []
      };

    case "TRUST":
      return {
        text: `Sí 🙌

Todos los equipos se revisan completamente antes de entregarse.

Además incluyen 1 año de garantía para tu tranquilidad.`,
        media: []
      };

    case "COMPARISON":
      return {
        text: `Sí claro 🙌

Tengo varias opciones disponibles según lo que necesites.

Si quieres dime para qué la vas a usar y te recomiendo la mejor opción calidad/precio 👇`,
        media: []
      };

    default:
      return null;
  }
}

/*
====================================================
PRODUCT RESPONSE (CLOSING ENGINE)
====================================================
*/

function productReply({ catalogMatches = [], interestLevel = null }) {

  const item = getMainCatalogItem(catalogMatches);

  if (!item) {
    return smartFallbackReply({
      stage: "no_product",
      products: catalogMatches
    });
  }

  const price = formatPrice(item.price_crc);

  /*
  ============================================
  HIGH INTENT → CIERRE DIRECTO
  ============================================
  */

  if (interestLevel === "HIGH") {
    return buildProductResponse(`Esta opción es de las más buscadas 👇

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
  MEDIUM INTENT → EMPUJAR SUAVEMENTE
  ============================================
  */

  if (interestLevel === "MEDIUM") {
    return buildProductResponse(`Te recomiendo esta opción 👇

💻 ${item.name}
💰 ${price}

Es muy usada para trabajo y estudio 🙌

Si quieres te puedo enviar fotos reales o reservar una para vos.`, item);
  }

  /*
  ============================================
  LOW / UNKNOWN → EXPLORAR + CALIFICAR
  ============================================
  */

  return buildProductResponse(`Tenemos esta opción disponible 👇

💻 ${item.name}
💰 ${price}

¿La estarías usando para estudio o trabajo?`, item);
}

  /*
  LOW INTENT → EMPUJE SUAVE
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
FALLBACK
====================================================
*/

function fallbackReply() {
  return {
    text: `Hola 🙌

Con gusto te ayudo a encontrar una buena opción.

¿Buscas laptop para estudio o trabajo?`,
    media: []
  };
}

/*
====================================================
MAIN GENERATOR
====================================================
*/

export async function generateReply({
  text = "",
  intent = "UNKNOWN",
  stage = "new",
  catalogMatches = [],
  interestLevel = "LOW"
}) {

  /*
  ====================================================
  1. OBJECTIONS FIRST (CRÍTICO)
  ====================================================
  */

  const objection = detectObjection(text);

  if (objection) {
    return objectionReply(objection);
  }

  /*
  ====================================================
  2. PRODUCT FLOW
  ====================================================
  */

  const productResponse = productReply({
    catalogMatches,
    interestLevel
  });

  if (productResponse) {
    return productResponse;
  }

  /*
  ====================================================
  3. FALLBACK
  ====================================================
  */

  return fallbackReply();
}

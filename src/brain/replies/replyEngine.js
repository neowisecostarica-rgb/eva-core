/*
====================================================
EVA REPLY ENGINE (CLOSING VERSION)
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
GREETING (AHORA CALIFICA)
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
PRODUCT REPLY (VENDEDOR REAL)
====================================================
*/

function productReply({ catalogMatches = [], interestLevel = null }) {

  const item = getMainCatalogItem(catalogMatches);

  if (!item) {
    return {
      text: `En este momento no encontré exactamente ese modelo 🙌

Cuéntame para qué la necesitas (estudio, trabajo, diseño, etc.) y te recomiendo la mejor opción.`,
      media: []
    };
  }

  const price = formatPrice(item.price_crc);

  // 🔥 ALTO INTERÉS → EMPUJA CIERRE
  if (interestLevel === "HIGH") {

    return buildProductResponse(`Esta opción es de las más buscadas 👇

💻 ${item.name}
💰 ${price}

✅ Línea corporativa
✅ SSD rápido
✅ 1 año de garantía

Ahorita tenemos pocas unidades disponibles.

Podemos apartarla con ₡20.000 para asegurártela 🙌

¿Te gustaría que te la reserve?`, item);

  }

  // 🟡 INTERÉS MEDIO → GUÍA + AVANZA
  if (interestLevel === "MEDIUM") {

    return buildProductResponse(`Te recomiendo esta opción 👇

💻 ${item.name}
💰 ${price}

Es una laptop corporativa muy buena para uso diario 👌

Si quieres te envío fotos reales y te explico todo.

¿La necesitas para estudio o trabajo?`, item);

  }

  // 🔵 FRÍO → CALIFICA
  return buildProductResponse(`Te puedo recomendar esta opción 👇

💻 ${item.name}
💰 ${price}

¿La necesitas para estudio o trabajo? Así te guío mejor 👌`, item);

}

/*
====================================================
OBJECTIONS (REDIRIGE A CIERRE)
====================================================
*/

function objectionReply({ objection = null }) {

  if (objection === "PRICE") {
    return {
      text: `Entiendo 🙌

Estos equipos son línea corporativa, diseñados para durar muchos años.

Incluyen SSD, revisión completa y garantía, por eso rinden mucho mejor que equipos básicos.

Muchos clientes los prefieren por eso 👌

Si quieres puedo ayudarte a encontrar una opción dentro de tu presupuesto.`,
      media: []
    };
  }

  if (objection === "NEW_OR_USED") {
    return {
      text: `Son equipos corporativos reacondicionados 🙌

Se revisan completamente antes de entregarlos y funcionan perfecto.

Además incluyen garantía para que compres con tranquilidad.

¿Para qué uso la necesitas?`,
      media: []
    };
  }

  if (objection === "TRUST") {
    return {
      text: `Claro 🙌

Todos los equipos se revisan antes de entregarse y tienen garantía.

También puedes coordinar entrega o retiro sin problema.

Si quieres te envío fotos reales del equipo 👌`,
      media: []
    };
  }

  return null;
}

/*
====================================================
CLOSING
====================================================
*/

function closingReply({ catalogMatches = [] }) {

  const item = getMainCatalogItem(catalogMatches);

  if (!item) {
    return {
      text: `Perfecto 🙌

Te ayudo con el proceso de compra o apartado.

¿Prefieres SINPE, transferencia o tarjeta?`,
      media: []
    };
  }

  const price = formatPrice(item.price_crc);

  return buildProductResponse(`Perfecto 🙌

💻 ${item.name}
💰 ${price}

Para asegurarlo puedes apartarlo con ₡20.000.

¿Te paso los datos para hacer el apartado?`, item);

}

/*
====================================================
BUY FLOW
====================================================
*/

function buyReplyByStage({ catalogMatches = [], stage = "new" }) {

  const item = getMainCatalogItem(catalogMatches);
  if (!item) return productReply({ catalogMatches });

  const price = formatPrice(item.price_crc);

  if (stage === "hot") {
    return buildProductResponse(`Perfecto 🙌

💻 ${item.name}
💰 ${price}

Es la última disponible en este momento.

Puedes apartarla con ₡20.000 para asegurarla.

¿Te paso los datos?`, item);
  }

  return productReply({ catalogMatches });

}

/*
====================================================
FALLBACK
====================================================
*/

function fallbackReply() {
  return {
    text: `Perfecto 🙌

Cuéntame qué estás buscando y te ayudo a encontrar la mejor opción 👌`,
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

  else if (objection) {
    response = objectionReply({ objection }) || fallbackReply();
  }

  else if (closingIntent) {
    response = closingReply({ catalogMatches });
  }

  else if (intent === "BUY") {
    response = buyReplyByStage({ catalogMatches, stage });
  }

  else if (score >= 85) {
    response = closingReply({ catalogMatches });
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

/*
====================================================
EVA REPLY ENGINE
Motor de respuestas comerciales
====================================================

Responsabilidades:

• Generar respuestas humanas
• Recomendar productos
• Guiar conversación comercial
• Adaptarse a la intención del cliente
• Ajustar estrategia según stage del pipeline
• Incluir imágenes de productos cuando existen

Este módulo hace que EVA suene
como una vendedora experta.

====================================================
*/

/*
====================================================
HELPERS
====================================================
*/

import { extractProductImages } from "../engines/mediaEngine.js";

/*
Formatea el precio de forma segura.
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

/*
Obtiene el primer producto encontrado.
*/
function getMainCatalogItem(catalogMatches = []) {

  if (!Array.isArray(catalogMatches) || !catalogMatches.length) {
    return null;
  }

  return catalogMatches[0];

}

/*
Construye respuesta con media opcional
*/
function buildProductResponse(text, product = null) {

  let media = [];

  if (product) {
    media = extractProductImages(product);
  }

  return {
    text,
    media
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

Te atiende *EVA*, asistente de ventas.

Estoy aquí para ayudarte a encontrar la mejor opción según lo que necesites.

¿En qué te puedo ayudar hoy?`,
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
      text: `En este momento no encontré un producto exacto con esa descripción.

Si quieres puedes contarme un poco más sobre lo que necesitas y te ayudo a encontrar la mejor opción.`,
      media: []
    };

  }

  const price = formatPrice(item.price_crc);

  if (interestLevel === "HIGH") {

    return buildProductResponse(`Te recomiendo esta opción 👇

💻 ${item.name}
💰 ${price}

Es una de las más buscadas porque funciona muy bien y tiene excelente relación precio-rendimiento.

Si quieres podemos **apartar una unidad ahora mismo** para que no se agoten.

¿Te gustaría ver fotos reales del equipo?`, item);

  }

  if (interestLevel === "MEDIUM") {

    return buildProductResponse(`Te recomiendo esta opción 👇

💻 ${item.name}
💰 ${price}

Es una laptop corporativa muy buscada porque ofrece muy buen rendimiento para estudio o trabajo.

¿Quieres que te envíe **fotos reales del equipo**?`, item);

  }

  return buildProductResponse(`Te puedo recomendar esta opción 👇

💻 ${item.name}
💰 ${price}

Si quieres puedo enviarte más detalles o fotos del equipo.`, item);

}

/*
====================================================
SUPPORT
====================================================
*/

function supportReply() {

  return {
    text: `Claro 👨‍🔧

Podemos ayudarte a revisar tu equipo en el taller.

Para orientarte mejor:

¿El problema es con **una computadora o una impresora**?`,
    media: []
  };

}

/*
====================================================
INFO
====================================================
*/

function infoReply() {

  return {
    text: `Perfecto 🙌

Con gusto te doy más información.

Cuéntame un poco más sobre lo que necesitas y así puedo recomendarte la mejor opción.`,
    media: []
  };

}

/*
====================================================
FALLBACK
====================================================
*/

function fallbackReply() {

  return {
    text: `Perfecto 🙌

Cuéntame un poco más sobre lo que estás buscando y con gusto te ayudo a encontrar la mejor opción.`,
    media: []
  };

}

/*
====================================================
BUY RESPONSES BY STAGE
====================================================
*/

function buyReplyByStage({
  catalogMatches = [],
  interestLevel = null,
  stage = "new"
}) {

  const item = getMainCatalogItem(catalogMatches);

  if (stage === "hot" && item) {

    const price = formatPrice(item.price_crc);

    return buildProductResponse(`Perfecto 🙌

Tenemos disponible esta opción:

💻 ${item.name}
💰 ${price}

Si quieres podemos **apartar una unidad ahora mismo con ₡20.000**.

¿Te paso los datos para hacer el apartado?`, item);

  }

  if (stage === "considering" && item) {

    const price = formatPrice(item.price_crc);

    return buildProductResponse(`Esta opción suele gustarle mucho a nuestros clientes 👇

💻 ${item.name}
💰 ${price}

Es una **laptop de línea corporativa**, diseñada para durar muchos años.

¿Te gustaría ver **fotos reales del equipo**?`, item);

  }

  return productReply({
    catalogMatches,
    interestLevel
  });

}

/*
====================================================
REPLY ORCHESTRATOR
====================================================
*/

export function generateReply({
  intent = null,
  catalogMatches = [],
  interestLevel = null,
  objection = null,
  closingIntent = null,
  opportunities = [],
  score = 0,
  stage = "new"
}) {

  if (intent === "GREETING") {
    return greetingReply();
  }

  if (intent === "BUY") {
    return buyReplyByStage({
      catalogMatches,
      interestLevel,
      stage
    });
  }

  if (intent === "SUPPORT") {
    return supportReply();
  }

  if (intent === "INFO") {
    return infoReply();
  }

  if (score >= 85) {

    return {
      text: `Perfecto 🙌

Ya tengo bastante claro lo que buscas.

Si quieres te ayudo a avanzar con la mejor opción disponible.`,
      media: []
    };

  }

  return fallbackReply();

}

/*
====================================================
EVA REPLY ENGINE
Motor de respuestas comerciales
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
OBJECTION HANDLING
====================================================
*/

function objectionReply({ objection = null, catalogMatches = [] }) {

  const item = getMainCatalogItem(catalogMatches);

  if (objection === "PRICE") {

    return {
      text: `Entiendo perfectamente 🙌

Estos equipos son **línea corporativa**, diseñados para durar muchos años.

Además incluyen **SSD, revisión técnica completa y garantía**, por eso tienen mucho mejor rendimiento que equipos básicos.

Muchos clientes los prefieren precisamente por esa relación **precio–durabilidad**.`,
      media: []
    };

  }

  if (objection === "NEW_OR_USED") {

    return {
      text: `Son **equipos corporativos reacondicionados**.

Se revisan completamente antes de entregarlos para asegurar que funcionen perfecto.

Además incluyen **garantía**, por lo que puedes usarlos con tranquilidad.`,
      media: []
    };

  }

  if (objection === "TRUST") {

    return {
      text: `Claro 🙌

Trabajamos con **equipos corporativos revisados**, y todos incluyen **garantía**.

Además puedes coordinar entrega o retiro para mayor tranquilidad.`,
      media: []
    };

  }

  return null;

}

/*
====================================================
CLOSING INTENT
====================================================
*/

function closingReply({ catalogMatches = [] }) {

  const item = getMainCatalogItem(catalogMatches);

  if (!item) {

    return {
      text: `Perfecto 🙌

Si quieres te puedo explicar cómo realizar la compra o coordinar la entrega.`,
      media: []
    };

  }

  const price = formatPrice(item.price_crc);

  return buildProductResponse(`Perfecto 🙌

Tenemos disponible:

💻 ${item.name}
💰 ${price}

Si quieres podemos **apartar una unidad con ₡20.000** para asegurarte disponibilidad.

¿Te paso los datos para el apartado?`, item);

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

Cuéntame un poco más sobre lo que estás buscando y con gusto te ayudo.`,
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

export async function generateReply({

  intent = null,
  catalogMatches = [],
  interestLevel = null,
  objection = null,
  closingIntent = null,
  opportunities = [],
  score = 0,
  stage = "new"

}) {

  let response;

  /*
  GREETING
  */

  if (intent === "GREETING") {

    response = greetingReply();

  }

  /*
  OBJECTION HANDLING
  */

  else if (objection) {

    const objectionResponse = objectionReply({
      objection,
      catalogMatches
    });

    if (objectionResponse) {
      response = objectionResponse;
    }

  }

  /*
  CLOSING INTENT
  */

  else if (closingIntent) {

    response = closingReply({
      catalogMatches
    });

  }

  /*
  BUY INTENT
  */

  else if (intent === "BUY") {

    response = buyReplyByStage({
      catalogMatches,
      interestLevel,
      stage
    });

  }

  /*
  SUPPORT
  */

  else if (intent === "SUPPORT") {

    response = supportReply();

  }

  /*
  INFO
  */

  else if (intent === "INFO") {

    response = infoReply();

  }

  /*
  HIGH SCORE PUSH
  */

  else if (score >= 85) {

    response = {
      text: `Perfecto 🙌

Ya tengo bastante claro lo que buscas.

Si quieres puedo ayudarte a avanzar con la mejor opción disponible y mostrarte algunas recomendaciones.`,
      media: []
    };

  }

  /*
  FALLBACK
  */

  else {

    response = fallbackReply();

  }

  /*
  AI Enhancement
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

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

Este módulo hace que EVA suene
como una vendedora experta.

====================================================
*/


/*
====================================================
GREETING REPLIES
====================================================
*/

function greetingReply() {

  return `Hola 🙌

Te atiende *EVA*, asistente de ventas.

Estoy aquí para ayudarte a encontrar la mejor opción según lo que necesites.

¿En qué te puedo ayudar hoy?`;

}


/*
====================================================
PRODUCT REPLIES
====================================================
*/

function productReply({ catalogMatches }) {

  if (!catalogMatches || catalogMatches.length === 0) {
    return null;
  }

  const item = catalogMatches[0];

  const price = `₡${Number(item.price_crc || item.price || 0).toLocaleString("es-CR")}`;

  return `Te recomiendo esta opción 👇

💻 ${item.name}
💰 ${price}

Es una opción que muchos clientes eligen porque ofrece muy buen rendimiento para el precio.

¿Quieres que te envíe *fotos reales del equipo* para que lo puedas ver mejor?`;

}


/*
====================================================
SUPPORT REPLIES
====================================================
*/

function supportReply() {

  return `Claro 👨‍🔧

Podemos ayudarte a revisar tu equipo en el taller.

Para orientarte mejor:

¿El problema es con **una computadora o una impresora**?`;

}


/*
====================================================
INFO REPLIES
====================================================
*/

function infoReply() {

  return `Perfecto 🙌

Con gusto te doy más información.

Cuéntame un poco más sobre lo que necesitas y así puedo recomendarte la mejor opción.`;

}


/*
====================================================
FALLBACK REPLIES
====================================================
*/

function fallbackReply() {

  return `Perfecto 🙌

Cuéntame un poco más sobre lo que estás buscando y con gusto te ayudo a encontrar la mejor opción.`;

}


/*
====================================================
REPLY ORCHESTRATOR
====================================================
*/

export function generateReply({
  intent,
  catalogMatches
}) {

  /*
  ----------------------------------------------------
  GREETING
  ----------------------------------------------------
  */

  if (intent === "GREETING") {
    return greetingReply();
  }

  /*
  ----------------------------------------------------
  BUY
  ----------------------------------------------------
  */

  if (intent === "BUY") {

    const product = productReply({ catalogMatches });

    if (product) {
      return product;
    }

  }

  /*
  ----------------------------------------------------
  SUPPORT
  ----------------------------------------------------
  */

  if (intent === "SUPPORT") {
    return supportReply();
  }

  /*
  ----------------------------------------------------
  INFO
  ----------------------------------------------------
  */

  if (intent === "INFO") {
    return infoReply();
  }

  /*
  ----------------------------------------------------
  FALLBACK
  ----------------------------------------------------
  */

  return fallbackReply();

}

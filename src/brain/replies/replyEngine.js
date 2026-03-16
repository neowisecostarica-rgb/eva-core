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

if (interestLevel === "HIGH") {

  return `Te recomiendo esta opción 👇

💻 ${item.name}
💰 ${price}

Es una de las más buscadas porque funciona muy bien y tiene excelente relación precio-rendimiento.

Si quieres podemos **apartar una unidad ahora mismo** para que no se agoten.

¿Te gustaría ver fotos reales del equipo?`;

}

if (interestLevel === "MEDIUM") {

  return `Te recomiendo esta opción 👇

💻 ${item.name}
💰 ${price}

Es una laptop corporativa muy buscada porque ofrece muy buen rendimiento para estudio o trabajo.

¿Quieres que te envíe **fotos reales del equipo**?`;

}

return `Te puedo recomendar esta opción 👇

💻 ${item.name}
💰 ${price}

Si quieres puedo enviarte más detalles o fotos del equipo.`;

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
  catalogMatches,
  interestLevel,
  objection
})

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

    function productReply({ catalogMatches, interestLevel })

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

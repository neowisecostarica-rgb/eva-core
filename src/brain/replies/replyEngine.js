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

function productReply({ catalogMatches = [], interestLevel }) {

  if (!catalogMatches.length) {
    return `En este momento no encontré un producto exacto con esa descripción.

Si quieres puedes contarme un poco más sobre lo que necesitas y te ayudo a encontrar la mejor opción.`;
  }

  const item = catalogMatches[0];

  const price = item.price_crc
    ? `₡${Number(item.price_crc).toLocaleString()}`
    : "Consultar precio";

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

}
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

Este motor genera la respuesta final de EVA.

Recibe señales comerciales detectadas por el Brain
y decide cómo responder al cliente.

Las respuestas pueden variar según:

• intent → intención principal del cliente
• catalogMatches → productos encontrados
• interestLevel → nivel de interés
• objection → objeciones detectadas
• closingIntent → intención de cierre
• score → puntuación comercial del lead
• stage → etapa del pipeline

Esto permite que EVA adapte su estrategia
según el momento de compra del cliente.
====================================================
*/

export function generateReply({
  intent = null,
  catalogMatches = [],
  interestLevel = null,
  objection = null,
  closingIntent = null,
  score = 0,
  stage = "new"
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

  /*
----------------------------------------------------
OBJECTION HANDLING
----------------------------------------------------
*/

if (objection === "NEW_OR_USED") {

  return `Buena pregunta 🙌

Estos equipos son **reacondicionados de línea corporativa**.

Eso significa que fueron usados en empresas grandes, luego pasan por revisión técnica completa, se les instala **SSD, Windows y se entregan listos para usar**.

La ventaja es que obtienes una **laptop corporativa de mucha mejor calidad** a un precio mucho más accesible.

Además incluyen **1 año de garantía**.

¿Quieres que te envíe fotos reales del equipo?`;

}

if (objection === "PRICE_OBJECTION") {

  return `Entiendo perfectamente 👍

La diferencia es que estas son **laptops de línea corporativa**, diseñadas para durar muchos años.

Además ya incluyen **SSD, Windows instalado y garantía**, por lo que no tienes que invertir más después.

Por eso muchos clientes las prefieren frente a equipos nuevos de gama baja.

Si quieres puedo enviarte **fotos reales del equipo** para que lo veas mejor.`;

}

if (objection === "CHEAP_SUSPICION") {

  return `Buena observación 👌

El precio es menor porque son **equipos corporativos reacondicionados**, no porque sean de baja calidad.

De hecho son modelos empresariales como **ThinkPad o Latitude**, que normalmente son mucho más resistentes que laptops de consumo.

Además los entregamos **revisados y con garantía**.

Si quieres puedo enviarte **fotos reales del equipo**.`;

}

if (objection === "WARRANTY_REQUEST") {

  return `Sí 🙌

Todos nuestros equipos incluyen **1 año de garantía** para tu tranquilidad.

Antes de entregarlos pasan por **revisión técnica completa**, limpieza y pruebas de funcionamiento.

Así puedes comprar con confianza.

¿Quieres que te envíe **fotos reales del equipo**?`;

}
  /*
----------------------------------------------------
BUY
----------------------------------------------------
*/

if (intent === "BUY") {

  return productReply({
    catalogMatches,
    interestLevel
  });

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

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
• Prepararse para devolver media (fotos) en el futuro

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
Si no existe precio, devuelve texto genérico.
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
Obtiene el primer producto encontrado del catálogo.
*/
function getMainCatalogItem(catalogMatches = []) {
  if (!Array.isArray(catalogMatches) || !catalogMatches.length) {
    return null;
  }

  return catalogMatches[0];
}

/*
Construye una respuesta estándar con producto.
Devuelve un objeto consistente:
{
  text: "...",
  media: []
}
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
GREETING REPLIES
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
PRODUCT REPLIES
====================================================

Respuesta comercial estándar cuando hay producto.
Se usa como base para leads interesados pero no
todavía en etapa fuerte de cierre.
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

¿Te gustaría ver fotos reales del equipo?`);
  }

  if (interestLevel === "MEDIUM") {
    return buildProductResponse(`Te recomiendo esta opción 👇

💻 ${item.name}
💰 ${price}

Es una laptop corporativa muy buscada porque ofrece muy buen rendimiento para estudio o trabajo.

¿Quieres que te envíe **fotos reales del equipo**?`);
  }

  return buildProductResponse(`Te puedo recomendar esta opción 👇

💻 ${item.name}
💰 ${price}

Si quieres puedo enviarte más detalles o fotos del equipo.`);
}

/*
====================================================
SUPPORT REPLIES
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
INFO REPLIES
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
FALLBACK REPLIES
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
OBJECTION REPLIES
====================================================

Respuestas para objeciones frecuentes.
*/

function objectionReply(objection) {
  if (objection === "NEW_OR_USED") {
    return {
      text: `Buena pregunta 🙌

Estos equipos son **reacondicionados de línea corporativa**.

Eso significa que fueron usados en empresas grandes, luego pasan por revisión técnica completa, se les instala **SSD, Windows y se entregan listos para usar**.

La ventaja es que obtienes una **laptop corporativa de mucha mejor calidad** a un precio mucho más accesible.

Además incluyen **1 año de garantía**.

¿Quieres que te envíe fotos reales del equipo?`,
      media: []
    };
  }

  if (objection === "PRICE_OBJECTION") {
    return {
      text: `Entiendo perfectamente 👍

La diferencia es que estas son **laptops de línea corporativa**, diseñadas para durar muchos años.

Además ya incluyen **SSD, Windows instalado y garantía**, por lo que no tienes que invertir más después.

Por eso muchos clientes las prefieren frente a equipos nuevos de gama baja.

Si quieres puedo enviarte **fotos reales del equipo** para que lo veas mejor.`,
      media: []
    };
  }

  if (objection === "CHEAP_SUSPICION") {
    return {
      text: `Buena observación 👌

El precio es menor porque son **equipos corporativos reacondicionados**, no porque sean de baja calidad.

De hecho son modelos empresariales como **ThinkPad o Latitude**, que normalmente son mucho más resistentes que laptops de consumo.

Además los entregamos **revisados y con garantía**.

Si quieres puedo enviarte **fotos reales del equipo**.`,
      media: []
    };
  }

  if (objection === "WARRANTY_REQUEST") {
    return {
      text: `Sí 🙌

Todos nuestros equipos incluyen **1 año de garantía** para tu tranquilidad.

Antes de entregarlos pasan por **revisión técnica completa**, limpieza y pruebas de funcionamiento.

Así puedes comprar con confianza.

¿Quieres que te envíe **fotos reales del equipo**?`,
      media: []
    };
  }

  return null;
}

/*
====================================================
BUY REPLIES BY STAGE
====================================================

Aquí EVA adapta la estrategia según la etapa del lead.
*/

function buyReplyByStage({
  catalogMatches = [],
  interestLevel = null,
  stage = "new",
  opportunities = []
}) {
  const item = getMainCatalogItem(catalogMatches);

  /*
  ----------------------------------------------------
  HOT LEADS → intentar cerrar venta
  ----------------------------------------------------
  */
  if (stage === "hot" && item) {
    const price = formatPrice(item.price_crc);

    return buildProductResponse(`Perfecto 🙌

Tenemos disponible esta opción:

💻 ${item.name}
💰 ${price}

Si quieres podemos **apartar una unidad ahora mismo con ₡20.000** y así te aseguras el equipo.

¿Te paso los datos para hacer el apartado?`);
  }

  /*
  ----------------------------------------------------
  CONSIDERING → persuadir
  ----------------------------------------------------
  */
  if (stage === "considering" && item) {
    const price = formatPrice(item.price_crc);

    return buildProductResponse(`Esta opción suele gustarle mucho a nuestros clientes 👇

💻 ${item.name}
💰 ${price}

Es una **laptop de línea corporativa**, lo que significa que está diseñada para durar muchos años y tener muy buen rendimiento.

¿Te gustaría ver **fotos reales del equipo**?`);
  }

  /*
  ----------------------------------------------------
  UPSELL / OPPORTUNITY
  ----------------------------------------------------

  Si no estamos cerrando fuerte todavía,
  podemos aprovechar para sugerir oportunidad.
  De momento lo dejamos suave y solo en un caso.
  */
  if (opportunities.includes("monitor_portable")) {
    return {
      text: `Además, muchos clientes que compran laptop también agregan un **monitor portátil de 15.6" Full HD**.

💰 ₡49.950

Es ideal para trabajar con doble pantalla, estudiar o ser más productivo.

Si quieres primero te muestro la laptop y luego te explico el monitor 🙌`,
      media: []
    };
  }

  /*
  ----------------------------------------------------
  INTERESTED / DEFAULT → recomendación normal
  ----------------------------------------------------
  */
  return productReply({
    catalogMatches,
    interestLevel
  });
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
• opportunities → ventas adicionales detectadas
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
  opportunities = [],
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
  ----------------------------------------------------
  OBJECTION HANDLING
  ----------------------------------------------------
  */
  if (objection) {
    const objectionResponse = objectionReply(objection);

    if (objectionResponse) {
      return objectionResponse;
    }
  }

  /*
  ----------------------------------------------------
  CLOSING INTENT
  ----------------------------------------------------

  Si el cliente ya muestra intención de cierre,
  EVA intenta mover la conversación a acción.
  */
  if (closingIntent) {
    return {
      text: `Perfecto 🙌

Ya estamos bastante cerca de dejarlo listo.

Si quieres puedo ayudarte con el siguiente paso para asegurar el equipo o explicarte la forma de pago disponible.`,
      media: []
    };
  }

  /*
  ----------------------------------------------------
  BUY
  ----------------------------------------------------
  */
  if (intent === "BUY") {
    return buyReplyByStage({
      catalogMatches,
      interestLevel,
      stage,
      opportunities
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
  HIGH SCORE FALLBACK
  ----------------------------------------------------

  Si por alguna razón no cayó en BUY pero el score
  es alto, respondemos con tono comercial.
  */
  if (score >= 85) {
    return {
      text: `Perfecto 🙌

Ya tengo bastante claro lo que buscas.

Si quieres te ayudo a avanzar con la mejor opción disponible y te explico cómo asegurarla.`,
      media: []
    };
  }

  /*
  ----------------------------------------------------
  FALLBACK
  ----------------------------------------------------
  */
  return fallbackReply();
}

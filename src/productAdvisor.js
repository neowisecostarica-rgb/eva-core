/*
====================================================
EVA COMMERCE — PRODUCT ADVISOR
====================================================

Responsabilidad:
Mejorar respuestas del asistente cuando hay productos
del catálogo disponibles.

Este módulo actúa como una capa comercial encima del
brain para convertir consultas en recomendaciones.

Arquitectura futura:
brain/commerce/productAdvisorEngine.js
====================================================
*/


/*
====================================================
UTILITIES
====================================================
*/

function formatMoney(value, currency = "CRC") {

  if (currency === "CRC") {
    return `₡${Number(value || 0).toLocaleString("es-CR")}`;
  }

  return `${value} ${currency}`;
}


/*
====================================================
PRODUCT SELECTION
====================================================
*/

function selectPrimaryProduct(catalogMatches = []) {

  if (!catalogMatches || catalogMatches.length === 0) {
    return null;
  }

  return catalogMatches[0];

}


/*
====================================================
REPLY ENHANCEMENT ENGINE
====================================================
*/

export function enhanceProductReply({
  reply,
  intent,
  catalogMatches = [],
  data = {}
}) {

  /*
  ----------------------------------------------------
  STEP 1 — VALIDATE CATALOG
  ----------------------------------------------------
  */

  if (!catalogMatches || catalogMatches.length === 0) {
    return reply;
  }

  const first = selectPrimaryProduct(catalogMatches);

  if (!first) {
    return reply;
  }


  /*
  ----------------------------------------------------
  STEP 2 — FORMAT PRICE
  ----------------------------------------------------
  */

  const price = formatMoney(first.price, first.currency);


  /*
  ----------------------------------------------------
  STEP 3 — DETECT CUSTOMER INTEREST
  ----------------------------------------------------
  */

  const interest = data?.interest_level || "LOW";


  /*
  ----------------------------------------------------
  STEP 4 — HIGH INTENT SALES PUSH
  ----------------------------------------------------
  */

  if (interest === "HIGH") {

    return `Te recomiendo esta opción:

💻 ${first.name}
${price}

Es una de las más buscadas por nuestros clientes.

¿Quieres que te envíe fotos reales del equipo?`;

  }


  /*
  ----------------------------------------------------
  STEP 5 — MEDIUM INTENT SALES PUSH
  ----------------------------------------------------
  */

  if (interest === "MEDIUM") {

    return `Una opción que suele funcionar muy bien es esta:

💻 ${first.name}
${price}

¿Quieres ver fotos reales del equipo?`;

  }


  /*
  ----------------------------------------------------
  STEP 6 — DEFAULT RESPONSE
  ----------------------------------------------------
  */

  return reply;

}

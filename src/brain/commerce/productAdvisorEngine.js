/*
====================================================
EVA COMMERCE — PRODUCT ADVISOR
====================================================
*/

function formatMoney(value, currency = "CRC") {
  if (currency === "CRC") {
    return `₡${Number(value || 0).toLocaleString("es-CR")}`;
  }
  return `${value} ${currency}`;
}

function selectPrimaryProduct(catalogMatches = []) {
  if (!catalogMatches || catalogMatches.length === 0) {
    return null;
  }
  return catalogMatches[0];
}

export function enhanceProductReply({
  reply,
  intent,
  catalogMatches = [],
  data = {}
}) {
  if (!catalogMatches || catalogMatches.length === 0) {
    return reply;
  }

  const first = selectPrimaryProduct(catalogMatches);
  if (!first) return reply;

  const price = formatMoney(first.price, first.currency);
  const interest = data?.interest_level || "LOW";

  if (interest === "HIGH") {
    return `Te recomiendo esta opción:

💻 ${first.name}
${price}

Es una de las más buscadas por nuestros clientes.

¿Quieres que te envíe fotos reales del equipo?`;
  }

  if (interest === "MEDIUM") {
    return `Una opción que suele funcionar muy bien es esta:

💻 ${first.name}
${price}

¿Quieres ver fotos reales del equipo?`;
  }

  return reply;
}

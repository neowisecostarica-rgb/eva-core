/*
====================================================
EVA COMMERCE — PRODUCT ADVISOR (SAFE vNext)
====================================================
*/

function formatMoney(value, currency = "CRC") {
  if (currency === "CRC") {
    return `₡${Number(value || 0).toLocaleString("es-CR")}`;
  }
  return `${value} ${currency}`;
}

function safe(text) {
  return String(text || "").toLowerCase();
}

export function enhanceProductReply({
  reply,
  intent,
  catalogMatches = [],
  data = {},
  userText = ""
}) {
  if (!catalogMatches || catalogMatches.length === 0) {
    return reply;
  }

  const first = catalogMatches[0];
  if (!first) return reply;

  const user = safe(userText);
  const name = safe(first.name);

  /*
  ========================================
  🔥 PROTEGER CATEGORÍA
  ========================================
  */

  if (user.includes("laptop") || user.includes("computadora")) {
    if (!name.includes("laptop") && !name.includes("thinkpad") && !name.includes("latitude")) {
      return reply;
    }
  }

  if (user.includes("impresora")) {
    if (!name.includes("impresora")) {
      return reply;
    }
  }

  /*
  ========================================
  🔥 PROTEGER MARCA
  ========================================
  */

  if (user.includes("dell") && !name.includes("dell")) {
    return "Claro 😊 En este momento no tengo Dell disponible, pero te puedo mostrar otras opciones similares. ¿Te gustaría ver alternativas?";
  }

  /*
  ========================================
  OUTPUT CONTROLADO
  ========================================
  */

  const price = formatMoney(first.price, first.currency);

  return `💻 ${first.name}
${price}

¿Quieres ver fotos reales del equipo?`;
}

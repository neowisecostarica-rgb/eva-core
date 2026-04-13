/*
====================================================
EVA BRAIN — INTENT ENGINE (FIXED — STABLE NORMALIZATION)
====================================================
*/

/*
====================================================
UTILS (CONTROL TOTAL)
====================================================
*/

function safe(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD") // separa tildes
    .replace(/[\u0300-\u036f]/g, "") // elimina tildes
    .trim();
}

/*
====================================================
INTENT DETECTION
====================================================
*/

export function detectIntent(text) {
  const t = safe(text);

  /*
  ========================================
  CLOSE INTENT
  ========================================
  */

  if (
    t.includes("quiero comprar") ||
    t.includes("la quiero") ||
    t.includes("lo quiero") ||
    t.includes("como pago") ||
    t.includes("sinpe") ||
    t.includes("tarjeta") ||
    t.includes("transferencia") ||
    t.includes("apartar") ||
    t.includes("reservar")
  ) {
    return "CLOSE_INTENT";
  }

  /*
  ========================================
  SERVICE
  ========================================
  */

  if (
    t.includes("mantenimiento") ||
    t.includes("reparacion") ||
    t.includes("reparar") ||
    t.includes("no imprime") ||
    t.includes("no enciende") ||
    t.includes("no carga") ||
    t.includes("lenta") ||
    t.includes("error")
  ) {
    return "SUPPORT";
  }

  /*
  ========================================
  GREETING
  ========================================
  */

  if (
    t === "hola" ||
    t === "buenas" ||
    t.includes("buenos dias") ||
    t.includes("buenas tardes") ||
    t.includes("buenas noches")
  ) {
    return "GREETING";
  }

  /*
  ========================================
  BUY
  ========================================
  */

  if (
    t.includes("precio") ||
    t.includes("cuanto cuesta") ||
    t.includes("cuanto vale") ||
    t.includes("disponible") ||
    t.includes("me interesa") ||
    t.includes("tienen") ||
    t.includes("busco") ||
    t.includes("ocupo") ||

    t.includes("laptop") ||
    t.includes("computadora") ||
    t.includes("pc") ||
    t.includes("impresora") ||
    t.includes("monitor")
  ) {
    return "BUY";
  }

  /*
  ========================================
  INFO
  ========================================
  */

  if (
    t.includes("garantia") ||
    t.includes("procesador") ||
    t.includes("ram") ||
    t.includes("ssd") ||
    t.includes("informacion")
  ) {
    return "INFO";
  }

  /*
  ========================================
  FALLBACK
  ========================================
  */

  return "UNKNOWN";
}

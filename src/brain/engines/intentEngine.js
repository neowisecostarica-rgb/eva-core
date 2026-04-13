/*
====================================================
EVA BRAIN — INTENT ENGINE (vNext FIXED FOLLOW-UP)
====================================================
*/

function safe(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function detectIntent(text) {
  const t = safe(text);

  /*
  ========================================
  🔥 FOLLOW-UP CORTO (CRÍTICO FIX)
  ========================================
  */

  if (
    t.length <= 25 &&
    (
      t.includes("para") ||
      t.includes("trabajo") ||
      t.includes("estudio") ||
      t.includes("precio") ||
      t.includes("como") ||
      t.includes("y la") ||
      t.includes("y el") ||
      t.includes("tiene") ||
      t.includes("dell") ||
      t.includes("hp") ||
      t.includes("lenovo")
    )
  ) {
    return "BUY";
  }

  /*
  ========================================
  CLOSE
  ========================================
  */

  if (
    t.includes("quiero comprar") ||
    t.includes("la quiero") ||
    t.includes("como pago") ||
    t.includes("sinpe") ||
    t.includes("tarjeta") ||
    t.includes("apartar")
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
    t.includes("reparar") ||
    t.includes("no enciende") ||
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
    t === "buenas"
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
    t.includes("cuanto") ||
    t.includes("disponible") ||
    t.includes("tienen") ||
    t.includes("laptop") ||
    t.includes("computadora") ||
    t.includes("impresora") ||
    t.includes("monitor")
  ) {
    return "BUY";
  }

  return "UNKNOWN";
}

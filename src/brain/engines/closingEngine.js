/*
====================================================
EVA CLOSING ENGINE
Detecta intención de cierre de venta
====================================================
*/

export function detectClosingIntent(text = "") {

  const t = text.toLowerCase();

  /*
  ====================================================
  PAYMENT INTENT
  ====================================================
  */

  if (
    t.includes("como pago") ||
    t.includes("sinpe") ||
    t.includes("tarjeta") ||
    t.includes("transferencia")
  ) {
    return "PAYMENT_INTENT";
  }

  /*
  ====================================================
  READY TO BUY
  ====================================================
  */

  if (
    t.includes("quiero esa") ||
    t.includes("la quiero") ||
    t.includes("apartar") ||
    t.includes("apartarla") ||
    t.includes("reservar") ||
    t.includes("me la deja")
  ) {
    return "READY_TO_BUY";
  }

  return null;
}

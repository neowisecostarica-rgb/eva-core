/*
====================================================
EVA BRAIN — PIPELINE ENGINE
====================================================

Responsabilidad:
Detectar eventos comerciales dentro del mensaje.
====================================================
*/

import { normalizeText } from "../utils/textUtils.js";


export function detectPipelineEvent(text) {

  const t = normalizeText(text);

  if (
    t.includes("como pago") ||
    t.includes("sinpe") ||
    t.includes("tarjeta") ||
    t.includes("transferencia")
  ) {
    return "PAYMENT_INTENT";
  }

  if (
    t.includes("quiero comprar") ||
    t.includes("la quiero") ||
    t.includes("apartar") ||
    t.includes("reservar")
  ) {
    return "READY_TO_BUY";
  }

  if (
    t.includes("muy cara") ||
    t.includes("muy caro")
  ) {
    return "OBJECTION_PRICE";
  }

  if (t.includes("garantia")) {
    return "WARRANTY_REQUEST";
  }

  if (
    t.includes("fotos") ||
    t.includes("imagenes")
  ) {
    return "CATALOG_REQUEST";
  }

  if (
    t.includes("precio") ||
    t.includes("cuanto cuesta")
  ) {
    return "PRICE_REQUEST";
  }

  return "QUESTION";

}

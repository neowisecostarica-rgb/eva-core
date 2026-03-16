/*
====================================================
EVA INTEREST ENGINE
Detecta nivel de interés del cliente
====================================================
*/

export function detectInterestLevel({
  intent,
  pipelineEvent,
  text
}) {

  const t = text.toLowerCase();

  /*
  ====================================================
  HIGH INTEREST
  Cliente listo para comprar
  ====================================================
  */

  if (
    intent === "CLOSE_INTENT" ||
    pipelineEvent === "READY_TO_BUY" ||
    t.includes("como pago") ||
    t.includes("sinpe") ||
    t.includes("tarjeta") ||
    t.includes("transferencia") ||
    t.includes("apartar") ||
    t.includes("reservar")
  ) {
    return "HIGH";
  }

  /*
  ====================================================
  MEDIUM INTEREST
  Cliente evaluando
  ====================================================
  */

  if (
    intent === "BUY" ||
    pipelineEvent === "PRICE_REQUEST" ||
    t.includes("precio") ||
    t.includes("cuanto cuesta") ||
    t.includes("informacion")
  ) {
    return "MEDIUM";
  }

  /*
  ====================================================
  LOW INTEREST
  Curioso o saludo
  ====================================================
  */

  return "LOW";
}

/*
====================================================
EVA BRAIN — INTENT ENGINE
====================================================

Responsabilidad:
Detectar la intención principal del mensaje del cliente.

Salida posible:
GREETING
BUY
INFO
SUPPORT
CLOSE_INTENT
UNKNOWN
====================================================
*/

import { normalizeText } from "../utils/textUtils.js";


/*
====================================================
INTENT DETECTION
====================================================
*/

export function detectIntent(text) {

  const t = normalizeText(text);

  /*
  ----------------------------------------------------
  CLOSE INTENT
  ----------------------------------------------------
  */

  if (
    t.includes("quiero comprar") ||
    t.includes("la quiero") ||
    t.includes("me interesa para comprar") ||
    t.includes("como pago") ||
    t.includes("sinpe") ||
    t.includes("tarjeta") ||
    t.includes("transferencia") ||
    t.includes("apartar") ||
    t.includes("apartarla") ||
    t.includes("se puede apartar") ||
    t.includes("me la deja") ||
    t.includes("quiero esa") ||
    t.includes("me la reservo") ||
    t.includes("reservarla")
  ) {
    return "CLOSE_INTENT";
  }

  /*
  ----------------------------------------------------
  BUY INTENT
  ----------------------------------------------------
  */

  if (
    t.includes("precio") ||
    t.includes("cuanto cuesta") ||
    t.includes("cuanto vale") ||
    t.includes("disponible") ||
    t.includes("me interesa") ||
    t.includes("tienen") ||
    t.includes("busco") ||
    t.includes("ocupo")
  ) {
    return "BUY";
  }

  /*
  ----------------------------------------------------
  INFO
  ----------------------------------------------------
  */

  if (
    t.includes("garantia") ||
    t.includes("procesador") ||
    t.includes("ram") ||
    t.includes("ssd") ||
    t.includes("caracteristicas") ||
    t.includes("informacion")
  ) {
    return "INFO";
  }

  /*
  ----------------------------------------------------
  SUPPORT
  ----------------------------------------------------
  */

  if (
    t.includes("mantenimiento") ||
    t.includes("reparacion") ||
    t.includes("no imprime") ||
    t.includes("no enciende") ||
    t.includes("esta lenta") ||
    t.includes("falla")
  ) {
    return "SUPPORT";
  }

  /*
  ----------------------------------------------------
  GREETING
  ----------------------------------------------------
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

  return "UNKNOWN";

}

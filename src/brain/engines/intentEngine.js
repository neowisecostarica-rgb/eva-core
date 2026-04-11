/*
====================================================
EVA BRAIN — INTENT ENGINE (ENFORCED v2)
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
  ========================================
  CLOSE INTENT (MÁXIMA PRIORIDAD)
  ========================================
  */

  if (
    t.includes("quiero comprar") ||
    t.includes("la quiero") ||
    t.includes("lo quiero") ||
    t.includes("como pago") ||
    t.includes("cómo pago") ||
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
  SUPPORT / SERVICE (ANTES DE BUY 🔥)
  ========================================
  */

  if (
    t.includes("mantenimiento") ||
    t.includes("reparacion") ||
    t.includes("reparación") ||
    t.includes("reparar") ||
    t.includes("no imprime") ||
    t.includes("no enciende") ||
    t.includes("no carga") ||
    t.includes("esta lenta") ||
    t.includes("está lenta") ||
    t.includes("falla") ||
    t.includes("dañado") ||
    t.includes("dañada") ||
    t.includes("no funciona") ||
    t.includes("error")
  ) {
    return "SUPPORT";
  }

  /*
  ========================================
  GREETING (ANTES DE BUY 🔥)
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
  BUY INTENT
  ========================================
  */

  if (
    t.includes("precio") ||
    t.includes("cuanto cuesta") ||
    t.includes("cuánto cuesta") ||
    t.includes("cuanto vale") ||
    t.includes("disponible") ||
    t.includes("me interesa") ||
    t.includes("tienen") ||
    t.includes("busco") ||
    t.includes("ocupo") ||

    /* PRODUCT KEYWORDS */
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
    t.includes("garantía") ||
    t.includes("procesador") ||
    t.includes("ram") ||
    t.includes("ssd") ||
    t.includes("caracteristicas") ||
    t.includes("características") ||
    t.includes("informacion") ||
    t.includes("información")
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

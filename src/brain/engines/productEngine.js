/*
====================================================
EVA BRAIN — PRODUCT INTEREST ENGINE
====================================================
*/

import { normalizeText } from "../utils/textUtils.js";


export function detectProductInterest(text) {

  const t = normalizeText(text);

  if (
    t.includes("laptop") ||
    t.includes("computadora") ||
    t.includes("compu") ||
    t.includes("portatil") ||
    t.includes("notebook")
  ) {
    return "laptop";
  }

  if (t.includes("impresora")) {
    return "impresora";
  }

  if (t.includes("monitor")) {
    return "monitor";
  }

  if (
    t.includes("cargador") ||
    t.includes("adaptador")
  ) {
    return "accesorio";
  }

  return null;

}

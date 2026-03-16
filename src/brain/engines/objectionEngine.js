/*
====================================================
EVA OBJECTION ENGINE
Detecta objeciones comerciales del cliente
====================================================
*/

export function detectObjection(text = "") {

  const t = text.toLowerCase();

  /*
  ====================================================
  OBJECIÓN DE PRECIO
  ====================================================
  */

  if (
    t.includes("muy caro") ||
    t.includes("muy cara") ||
    t.includes("caro") ||
    t.includes("carísima") ||
    t.includes("carisima")
  ) {
    return "PRICE_OBJECTION";
  }

  /*
  ====================================================
  DUDA SOBRE SI ES NUEVO
  ====================================================
  */

  if (
    t.includes("es nueva") ||
    t.includes("es nuevo") ||
    t.includes("son nuevas") ||
    t.includes("es usada") ||
    t.includes("es reacondicionada")
  ) {
    return "NEW_OR_USED";
  }

  /*
  ====================================================
  SOSPECHA DE PRECIO BAJO
  ====================================================
  */

  if (
    t.includes("por que tan barata") ||
    t.includes("porque tan barata") ||
    t.includes("tan barata")
  ) {
    return "CHEAP_SUSPICION";
  }

  /*
  ====================================================
  GARANTÍA
  ====================================================
  */

  if (
    t.includes("garantia") ||
    t.includes("tiene garantia")
  ) {
    return "WARRANTY_REQUEST";
  }

  return null;
}

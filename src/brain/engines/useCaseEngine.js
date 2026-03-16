/*
====================================================
EVA BRAIN — USE CASE ENGINE
====================================================
*/

import { normalizeText } from "../utils/textUtils.js";


export function detectUseCase(text) {

  const t = normalizeText(text);

  if (
    t.includes("estudio") ||
    t.includes("escuela") ||
    t.includes("colegio") ||
    t.includes("universidad") ||
    t.includes("tareas")
  ) {
    return "estudio";
  }

  if (
    t.includes("trabajo") ||
    t.includes("oficina") ||
    t.includes("empresa") ||
    t.includes("excel")
  ) {
    return "trabajo";
  }

  if (
    t.includes("diseno") ||
    t.includes("diseño") ||
    t.includes("autocad") ||
    t.includes("photoshop")
  ) {
    return "diseno";
  }

  if (
    t.includes("gaming") ||
    t.includes("juegos")
  ) {
    return "gaming";
  }

  return null;

}

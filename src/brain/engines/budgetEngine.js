/*
====================================================
EVA BRAIN — BUDGET ENGINE
====================================================
*/

import { normalizeText } from "../utils/textUtils.js";


export function detectBudget(text) {

  const t = normalizeText(text);

  const milMatch = t.match(/(\d{2,4})\s*mil\b/);

  if (milMatch) {
    return parseInt(milMatch[1], 10) * 1000;
  }

  const numbers = [...t.matchAll(/\b\d{5,7}\b/g)]
    .map(m => parseInt(m[0], 10));

  if (numbers.length > 0) {
    return Math.max(...numbers);
  }

  const crcMatches = [...t.matchAll(/₡\s*([\d.,]+)/g)]
    .map(m => parseInt(String(m[1]).replace(/[^\d]/g, ""), 10));

  if (crcMatches.length > 0) {
    return Math.max(...crcMatches);
  }

  return null;

}

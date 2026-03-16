/*
====================================================
EVA BRAIN — ARRAY UTILITIES
====================================================
*/


/*
====================================================
UNIQUE STRINGS
====================================================
*/

export function uniqueStrings(values = []) {

  return [...new Set(
    values
      .filter(Boolean)
      .map(v => String(v).trim())
  )];

}


/*
====================================================
ADD OPPORTUNITY
====================================================
*/

export function addOpportunity(opportunities, value) {

  if (!value) return opportunities;

  if (!opportunities.includes(value)) {
    opportunities.push(value);
  }

  return opportunities;

}

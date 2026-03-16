/*
====================================================
EVA BRAIN — JSON UTILITIES
====================================================
*/


/*
====================================================
SAFE JSON PARSER
====================================================
*/

export function safeJson(value, fallback = {}) {

  if (!value) return fallback;

  if (typeof value === "object") return value;

  try {

    return JSON.parse(value);

  } catch {

    return fallback;

  }

}

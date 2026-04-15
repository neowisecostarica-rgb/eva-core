// src/brain/utils/responseFormatter.js

/*
====================================================
EVA CORE — RESPONSE FORMATTER (SALES CONTROL vNEXT)
====================================================
*/

export function formatAIResponse({ text, agentName = "Eva", context = {} }) {
  if (!text || typeof text !== "string") return null;

  let clean = text.trim();

  const stage = context?.stage || "EARLY";
  const strategy = context?.strategy || "DEFAULT";

  /*
  ====================================================
  REMOVE ROLE PREFIXES
  ====================================================
  */

  clean = clean.replace(/cliente:\s*/gi, "");
  clean = clean.replace(/asistente:\s*/gi, "");
  clean = clean.replace(/assistant:\s*/gi, "");

  /*
  ====================================================
  NORMALIZE NAME
  ====================================================
  */

  clean = clean.replace(
    /le atiende asistente/gi,
    `le atiende ${agentName}`
  );

  /*
  ====================================================
  ANTI INFORMATION DUMP (SMART)
  ====================================================
  */

  const MAX_LENGTH_EARLY = 220;
  const MAX_LENGTH_DEFAULT = 320;

  const maxLength =
    stage === "EARLY" || strategy === "QUALIFY"
      ? MAX_LENGTH_EARLY
      : MAX_LENGTH_DEFAULT;

  if (clean.length > maxLength) {
    clean = clean.slice(0, maxLength);

    const lastDot = clean.lastIndexOf(".");
    if (lastDot > 50) {
      clean = clean.slice(0, lastDot + 1);
    }
  }

  /*
  ====================================================
  LIMIT LINES (ANTI-SPAM)
  ====================================================
  */

  const lines = clean.split("\n").filter(Boolean);

  if (lines.length > 4) {
    clean = lines.slice(0, 4).join("\n");
  }

  /*
  ====================================================
  REMOVE TECHNICAL LANGUAGE (LIGHT FILTER)
  ====================================================
  */

  const techWords = [
    "procesador",
    "ghz",
    "ram",
    "ssd",
    "hdd",
    "cache",
    "threads",
  ];

  if (stage === "EARLY") {
    techWords.forEach((word) => {
      const regex = new RegExp(word, "gi");
      clean = clean.replace(regex, "");
    });
  }

  /*
  ====================================================
  ENSURE HUMAN STYLE
  ====================================================
  */

  clean = clean.replace(/\s+/g, " ").trim();

  /*
  ====================================================
  EMOJI CONTROL (MAX 1)
  ====================================================
  */

  const emojis = clean.match(/[\u{1F300}-\u{1FAFF}]/gu) || [];

  if (emojis.length > 1) {
    let count = 0;
    clean = clean.replace(/[\u{1F300}-\u{1FAFF}]/gu, (match) => {
      count++;
      return count === 1 ? match : "";
    });
  }

  /*
  ====================================================
  CLOSING ENFORCEMENT (CRITICAL)
  ====================================================
  */

  const endsWithQuestion = clean.trim().endsWith("?");

  if (!endsWithQuestion) {
    const lower = clean.toLowerCase();

    const hasClosing =
      lower.includes("apartar") ||
      lower.includes("apartado") ||
      lower.includes("envío") ||
      lower.includes("envio") ||
      lower.includes("coordinar") ||
      lower.includes("traer") ||
      lower.includes("visitar");

    if (!hasClosing) {
      if (strategy === "QUALIFY") {
        clean += " ¿La necesita para estudio o trabajo?";
      } else if (strategy === "ASK") {
        clean += " ¿Me podría indicar un poco más del problema?";
      } else if (strategy === "RECOMMEND") {
        clean += " Si gusta le recomiendo una opción 👍";
      } else if (strategy === "CLOSE") {
        clean += " Si gusta lo puede apartar y coordinamos de una vez 😊";
      } else {
        clean += " ¿En qué le gustaría que le ayude exactamente?";
      }
    }
  }

  /*
  ====================================================
  FINAL CLEAN
  ====================================================
  */

  clean = clean.replace(/\s+/g, " ").trim();

  return clean;
}

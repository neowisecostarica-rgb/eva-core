// src/brain/utils/responseFormatter.js

export function formatAIResponse({ text, agentName = "Eva" }) {
  if (!text || typeof text !== "string") return null;

  let clean = text.trim();

  // ================================
  // REMOVE ROLE PREFIXES
  // ================================
  clean = clean.replace(/cliente:\s*/gi, "");
  clean = clean.replace(/asistente:\s*/gi, "");
  clean = clean.replace(/assistant:\s*/gi, "");

  // ================================
  // NORMALIZE NAME
  // ================================
  clean = clean.replace(/le atiende asistente/gi, `le atiende ${agentName}`);

  // ================================
  // REMOVE EXCESSIVE LENGTH
  // ================================
  const MAX_LENGTH = 280;

  if (clean.length > MAX_LENGTH) {
    clean = clean.slice(0, MAX_LENGTH);

    // cortar en última frase completa
    const lastDot = clean.lastIndexOf(".");
    if (lastDot > 50) {
      clean = clean.slice(0, lastDot + 1);
    }
  }

  // ================================
  // AVOID MULTIPLE PRODUCTS LISTING
  // ================================
  const lines = clean.split("\n").filter(Boolean);

  if (lines.length > 4) {
    clean = lines.slice(0, 4).join("\n");
  }

  // ================================
  // ENSURE END WITH ACTION
  // ================================
  const endsWithQuestion = clean.trim().endsWith("?");

  if (!endsWithQuestion) {
    clean += " ¿Qué uso le quiere dar?";
  }

  // ================================
  // FINAL CLEAN
  // ================================
  clean = clean.replace(/\s+/g, " ").trim();

  return clean;
}

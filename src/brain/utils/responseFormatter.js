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
// ENSURE END WITH ACTION (SMART)
// ================================
const endsWithQuestion = clean.trim().endsWith("?");

if (!endsWithQuestion) {
  const lower = clean.toLowerCase();

  const isClosing =
    lower.includes("envio") ||
    lower.includes("envío") ||
    lower.includes("entrega") ||
    lower.includes("retiro") ||
    lower.includes("apartar") ||
    lower.includes("apartado") ||
    lower.includes("coordinar");

  if (!isClosing) {
    clean += " ¿Qué uso le quiere dar?";
  }
}

  // ================================
  // FINAL CLEAN
  // ================================
  clean = clean.replace(/\s+/g, " ").trim();

  return clean;
}

export function applyAIGuards({ aiResponse }) {
  if (!aiResponse) return { text: null };

  let text =
    typeof aiResponse === "string"
      ? aiResponse
      : aiResponse?.text || "";

  text = text.trim();

  // ❌ eliminar respuestas inválidas
  if (!text || text.length < 3) {
    return { text: null };
  }

  // ❌ eliminar respuestas tipo "no sé"
  if (text.toLowerCase().includes("no sé")) {
    return { text: null };
  }

  return { text };
}

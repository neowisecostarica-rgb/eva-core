// src/aiReply.js

export async function generateAIReply({ text, stage, intent, entities, summary }) {
  try {
    if (!text) return null;

    // =============================
    // RESPUESTAS SEGÚN INTENCIÓN
    // =============================

    if (intent === "GREETING") {
      return "Hola 😊 con gusto te ayudo. ¿Qué estás buscando?";
    }

    if (intent === "BUY") {
      return "Claro 🙌 te ayudo a encontrar una buena opción. ¿Es para estudio, trabajo o algo más específico?";
    }

    if (intent === "INFO") {
      return "Perfecto 😊 contame un poco más y te ayudo mejor 🙌";
    }

    // =============================
    // FALLBACK
    // =============================

    return "Hola 😊 ¿Qué estás buscando exactamente?";

  } catch (err) {
    console.error("❌ AI error:", err);
    return null;
  }
}

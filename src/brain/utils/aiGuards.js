// src/brain/utils/aiGuards.js

export function applyAIGuards({ aiResponse, context }) {
  try {
    if (!aiResponse || !aiResponse.text) {
      return null;
    }

    let text = aiResponse.text.trim();

    /*
    ========================================
    1. FILTROS BÁSICOS
    ========================================
    */

    // Evitar respuestas demasiado cortas
    if (text.length < 10) {
      return null;
    }

    // Evitar respuestas vacías o inválidas
    if (text === "null" || text === "undefined") {
      return null;
    }

    /*
    ========================================
    2. REGLAS COMERCIALES EVA
    ========================================
    */

    const forbiddenPhrases = [
      "no sé",
      "no tengo información",
      "no puedo ayudarte",
      "no estoy seguro",
    ];

    for (const phrase of forbiddenPhrases) {
      if (text.toLowerCase().includes(phrase)) {
        return null;
      }
    }

    /*
    ========================================
    3. LONGITUD CONTROLADA
    ========================================
    */

    // Evitar respuestas extremadamente largas (WhatsApp UX)
    if (text.length > 600) {
      text = text.slice(0, 580) + "...";
    }

    /*
    ========================================
    4. TONO (SUAVIZADO)
    ========================================
    */

    // Asegurar tono cercano
    if (!text.includes("😊") && !text.includes("🙌")) {
      text = text + " 😊";
    }

    /*
    ========================================
    5. NORMALIZACIÓN FINAL
    ========================================
    */

    return {
      text,
    };

  } catch (err) {
    console.error("❌ AI GUARDS ERROR:", err);
    return null;
  }
}

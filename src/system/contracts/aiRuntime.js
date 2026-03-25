// src/system/contracts/aiRuntime.js

/*
====================================================
EVA AI RUNTIME CONTRACT (ENFORCEMENT LAYER)
====================================================

Este módulo NO valida.
Este módulo hace cumplir el sistema.

Si algo no cumple → rompe (throw)

====================================================
*/

export function enforceAIRuntime({ aiResponse, source = "unknown" }) {
  try {
    /*
    ========================================
    1. EXISTENCIA DE RESPUESTA
    ========================================
    */

    if (!aiResponse) {
      throw new Error(`[AI_RUNTIME] Missing aiResponse (source: ${source})`);
    }

    /*
    ========================================
    2. FORMATO BÁSICO
    ========================================
    */

    if (typeof aiResponse !== "object") {
      throw new Error(
        `[AI_RUNTIME] Invalid aiResponse format (not object) (source: ${source})`
      );
    }

    /*
    ========================================
    3. TEXTO OBLIGATORIO
    ========================================
    */

    if (!aiResponse.text || typeof aiResponse.text !== "string") {
      throw new Error(
        `[AI_RUNTIME] Missing or invalid text in aiResponse (source: ${source})`
      );
    }

    const text = aiResponse.text.trim();

    if (text.length === 0) {
      throw new Error(
        `[AI_RUNTIME] Empty AI response (source: ${source})`
      );
    }

    /*
    ========================================
    4. DETECCIÓN DE RESPUESTAS SOSPECHOSAS
    ========================================
    */

    const suspiciousPatterns = [
      "no entendí",
      "no puedo ayudarte",
      "error",
      "undefined",
      "null",
    ];

    const lower = text.toLowerCase();

    const suspiciousHit = suspiciousPatterns.find(p =>
      lower.includes(p)
    );

    if (suspiciousHit) {
      console.warn(
        `[AI_RUNTIME WARNING] Suspicious AI output detected: "${suspiciousHit}" (source: ${source})`
      );
    }

    /*
    ========================================
    5. DETECCIÓN DE RESPUESTA DEMASIADO CORTA
    ========================================
    */

    if (text.length < 5) {
      console.warn(
        `[AI_RUNTIME WARNING] Response too short (source: ${source})`
      );
    }

    /*
    ========================================
    6. DETECCIÓN DE HARD-CODE (BÁSICO)
    ========================================
    */

    // (heurística simple, luego se puede mejorar)

    if (
      text === "Hola 😊 con gusto te ayudo. Contame un poco más qué estás buscando y te guío."
    ) {
      console.warn(
        `[AI_RUNTIME WARNING] Fallback response used (source: ${source})`
      );
    }

    /*
    ========================================
    7. TODO OK
    ========================================
    */

    return true;

  } catch (err) {
    console.error("❌ AI RUNTIME VIOLATION:", err.message);

    /*
    ========================================
    🔥 MODO ESTRICTO (IMPORTANTE)
    ========================================

    - En desarrollo: puedes cambiar a return false
    - En producción: SIEMPRE throw

    ========================================
    */

    throw err;
  }
}

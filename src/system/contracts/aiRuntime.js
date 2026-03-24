// src/system/contracts/aiRuntime.js

export function enforceAIRuntime({ aiResponse, source }) {
  /*
  ========================================
  1. AI RESPONSE OBLIGATORIA
  ========================================
  */

  if (!aiResponse || !aiResponse.text) {
    console.error("❌ AI CONTRACT VIOLATION: empty AI response");

    throw new Error("AI must generate a response");
  }

  /*
  ========================================
  2. VALIDAR QUE NO SEA HARDCODE
  ========================================
  */

  const suspiciousPatterns = [
    "Hola 😊 con gusto te ayudo",
    "Contame un poco más",
  ];

  for (const pattern of suspiciousPatterns) {
    if (aiResponse.text.includes(pattern)) {
      console.warn("⚠️ Possible hardcoded response detected:", pattern);
    }
  }

  /*
  ========================================
  3. LOG DE ORIGEN
  ========================================
  */

  console.log("🧠 AI CONTRACT OK:", {
    source,
    length: aiResponse.text.length,
  });

  return true;
}

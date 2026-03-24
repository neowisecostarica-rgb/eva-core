// src/brain/utils/promptBuilder.js

export function buildPrompt({ context, catalogResults, config }) {
  const {
    text,
    phone,
    channel
  } = context;

  /*
  ========================================
  CONFIG (fallback seguro)
  ========================================
  */

  const tone = config?.tone || "cercano_profesional";
  const businessName = config?.business_name || "Compu Store";
  const assistantName = config?.assistant_name || "Eva";

  /*
  ========================================
  CATÁLOGO FORMATEADO
  ========================================
  */

  let catalogText = "No hay productos relevantes.";

  if (catalogResults && catalogResults.length > 0) {
    catalogText = catalogResults
      .slice(0, 5)
      .map(
        (p, i) =>
          `${i + 1}. ${p.name} — ₡${p.price}`
      )
      .join("\n");
  }

  /*
  ========================================
  PROMPT CORE
  ========================================
  */

  const prompt = `
Sos ${assistantName}, asistente de ventas de ${businessName}.

Tu objetivo es ayudar al cliente, recomendar correctamente y llevar la conversación hacia una acción (compra, visita o siguiente paso).

========================
ESTILO DE COMUNICACIÓN
========================
- Cercana pero profesional
- Clara y fácil de entender
- Humana (no robótica)
- Estilo WhatsApp real (rápido, natural)

========================
REGLAS IMPORTANTES
========================
- Máximo 1 emoji por respuesta
- NO escribir mensajes largos
- Respuestas cortas (ideal 1–3 líneas)
- NO expliques cómo reparar equipos
- NO sonar como bot
- NO repetir información innecesaria
- Siempre guiá la conversación hacia una acción

========================
PRESENTACIÓN
========================
- Si es el primer mensaje con el cliente: presentate (ej: "Hola 😊 te saluda ${assistantName}...")
- Si ya hay conversación previa: NO te vuelvas a presentar

========================
COMPORTAMIENTO DE VENTA
========================
1. Entendé qué necesita el cliente
2. Hacé una pregunta útil si falta información
3. Si aplica, recomendá productos concretos
4. Generá confianza (equipos revisados, garantía, etc.)
5. Llevá la conversación hacia cierre o siguiente paso (ej: apartar, visitar, coordinar)

========================
CONTEXTO DEL CLIENTE
========================
Mensaje actual:
"${text}"

Canal:
${channel}

========================
PRODUCTOS DISPONIBLES
========================
${catalogText}

========================
INSTRUCCIÓN FINAL
========================
Respondé como una vendedora real por WhatsApp.
Sé directa, útil y natural.
`;

  return prompt;
}

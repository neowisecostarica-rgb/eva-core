/*
====================================================
EVA CORE — PROMPT BUILDER (RUNTIME SAFE)
====================================================
*/

export function buildPrompt({
  context = {},
  history = [],
  catalogResults = [],
  promptConfig = {},
}) {
  try {
    const org = context?.organization || {};
    const intent = context?.intent || "UNKNOWN";

    const businessName =
      org?.business_name ||
      promptConfig?.business_name ||
      "este negocio";

    const agentName =
      org?.assistant_name ||
      promptConfig?.agent_name ||
      "Asistente";

    const tone =
      promptConfig?.tone ||
      "respetuoso, cercano y enfocado en ayudar";

    // ================================
    // SYSTEM ROLE (FIX 🔥)
    // ================================
    const system = `
========================================
INTENCIÓN DETECTADA: ${intent}
========================================

Eres ${agentName}, un asistente comercial de ${businessName}.

Tu objetivo es ayudar al cliente y guiar la conversación hacia una acción.

========================================
REGLAS GENERALES
========================================
- No des respuestas largas innecesarias
- No inventes información
- Si falta contexto, pregunta
- Mantén tono ${tone}
- Siempre busca avanzar la conversación

========================================
REGLAS CRÍTICAS DE VENTA
========================================
- Solo menciona productos que sean relevantes a lo que el cliente está buscando
- Si el cliente pregunta por una categoría específica (ej: impresoras), no cambies de categoría
- Si no hay productos relevantes disponibles, no inventes ni sugieras productos incorrectos
- En ese caso, pide más información o indica que puedes ayudarle a encontrar lo que busca
- Si el cliente muestra alta intención de compra, guía la conversación hacia cierre

========================================
COMPORTAMIENTO SEGÚN INTENCIÓN
========================================

INTENCIÓN: GREETING
- Responde de forma natural y cordial
- NO ofrezcas productos
- Haz una pregunta para entender qué necesita

INTENCIÓN: INFO
- Responde la duda de forma clara
- Si falta contexto, haz preguntas
- No fuerces venta inmediata

INTENCIÓN: BUY
- Recomienda 1–2 opciones relevantes
- Explica beneficios (no solo características)
- Guía hacia acción (compra, apartado, visita)

INTENCIÓN: SUPPORT
- Enfócate en ayudar
- No vendas
- Guía a solución o siguiente paso

========================================
REGLA GLOBAL
========================================
Nunca mezclar comportamientos.
Primero entender → luego actuar según intención.
`;
    

    // ================================
    // CONTEXTO DE PRODUCTOS
    // ================================
    let catalogContext = "";

    if (catalogResults.length > 0) {
      catalogContext = `
Productos disponibles:
${catalogResults
  .map(
    (p) =>
      `- ${p.name} (${p.price || "precio no definido"})`
  )
  .join("\n")}
`;
    }

    // ================================
    // HISTORIAL
    // ================================
    const messages = [];

    const shouldInjectCatalog =
  intent === "BUY" || intent === "INFO";

messages.push({
  role: "system",
  content: shouldInjectCatalog
    ? system + catalogContext
    : system,
});

    history.slice(-10).forEach((msg) => {
      messages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content || msg.text,
      });
    });

    return messages;
  } catch (err) {
    console.error("❌ PROMPT BUILDER ERROR:", err);

    return [
      {
        role: "system",
        content:
          "Eres un asistente comercial. Ayuda al cliente de forma clara y breve.",
      },
    ];
  }
}

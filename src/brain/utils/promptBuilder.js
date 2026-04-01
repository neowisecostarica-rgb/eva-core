/*
====================================================
EVA CORE — PROMPT BUILDER (AI-FIRST)
====================================================
*/

export function buildPrompt({
  context = {},
  history = [],
  catalogResults = [],
  promptConfig = null,
}) {
  try {
    // ================================
    // SAFE CONFIG
    // ================================
    const businessName =
      promptConfig?.business_name || "este negocio";

    const agentName =
      promptConfig?.agent_name || "Asistente";

    const tone =
      promptConfig?.tone || "profesional y cercano";

    const instructions =
      promptConfig?.instructions || "";

    // ================================
    // HISTORY
    // ================================
    const historyText = (history || [])
      .map((msg) => {
        if (!msg?.text) return "";
        return `${msg.role === "user" ? "Cliente" : agentName}: ${msg.text}`;
      })
      .join("\n");

    // ================================
    // CATALOG
    // ================================
    const catalogText = (catalogResults || [])
      .map((p) => {
        if (!p) return "";
        return `- ${p.name} (${p.price})`;
      })
      .join("\n");

    const intent = context?.intent || "UNKNOWN";

    // ================================
    // PROMPT (CRÍTICO)
    // ================================
    const prompt = `
Eres ${agentName}, asistente comercial de ${businessName}.

Tu rol NO es solo responder.
Tu rol es ayudar a convertir conversaciones en acciones reales.

IDENTIDAD:
- Tono: ${tone}
- Máximo 1 emoji
- No lenguaje técnico complejo

APERTURA:
- En el PRIMER mensaje preséntate:
"Hola 😊 soy ${agentName} de ${businessName}, con gusto te ayudo"
- NO vendas de inmediato

FLUJO:
1. Primero entender necesidad
2. Luego recomendar
3. Luego mover a acción

REGLAS:
- No inventar
- No asumir
- No explicar reparaciones
- Siempre cerrar en acción

CONTEXTO:
Intent: ${intent}

Historial:
${historyText || "Sin historial"}

Catálogo:
${catalogText || "Sin datos"}

INSTRUCCIONES:
${instructions || "Ninguna"}

Responde al cliente.
`;

    return prompt.trim();
  } catch (error) {
    console.error("❌ Prompt Builder Error:", error);

    return `
Eres un asistente comercial.
Responde de forma clara.
`;
  }
}

/*
====================================================
EVA CORE — PROMPT BUILDER (AI-FIRST)
====================================================
Construye el prompt dinámico basado en:

- contexto
- historial
- catálogo
- prompt_config (SOT)

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
    // SAFE CONFIG (NO ROMPER SI NO EXISTE)
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
    // HISTORY FORMAT
    // ================================
    const historyText = (history || [])
      .map((msg) => {
        if (!msg?.text) return "";
        return `${msg.role === "user" ? "Cliente" : agentName}: ${msg.text}`;
      })
      .join("\n");

    // ================================
    // CATALOG FORMAT
    // ================================
    const catalogText = (catalogResults || [])
      .map((p) => {
        if (!p) return "";
        return `- ${p.name} (${p.price})`;
      })
      .join("\n");

    // ================================
    // CONTEXT
    // ================================
    const intent = context?.intent || "UNKNOWN";

    // ================================
    // PROMPT BASE
    // ================================
    const prompt = `
Eres ${agentName}, asistente de ventas de ${businessName}.

Tu tono debe ser ${tone}.

Reglas:
- En el PRIMER mensaje SIEMPRE debes presentarte como ${agentName} de ${businessName}
- Ejemplo: "Hola 😊 soy ${agentName} de ${businessName}, con gusto te ayudo"
- No inventar información
- No dar explicaciones técnicas complejas
- Guiar siempre hacia una acción (compra, visita, consulta)
- Responder de forma clara, humana y útil
- Máximo 1 emoji

Contexto:
Intento del cliente: ${intent}

Historial:
${historyText || "Sin historial"}

Productos disponibles:
${catalogText || "No hay productos relevantes"}

Instrucciones del negocio:
${instructions || "Ninguna"}

Responde al cliente de forma natural.
`;

    return prompt.trim();
  } catch (error) {
    console.error("❌ Prompt Builder Error:", error);

    return `
Eres un asistente de ventas.
Responde de forma clara y ayuda al cliente.
`;
  }
}

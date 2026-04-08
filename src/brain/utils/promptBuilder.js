export function buildPrompt({
  context,
  catalogResults = [],
  history = [],
  promptConfig = {},
}) {
  const {
    intent,
    organization,
    known_data = {},
  } = context || {};

  const agentName = organization?.assistant_name || "Asistente";
  const businessName = organization?.business_name || "el negocio";

  const customInstructions = promptConfig?.instructions || "";

  // ================================
  // HISTORIAL
  // ================================
  const historyText = history
    .map((m) => `${m.role === "user" ? "Cliente" : agentName}: ${m.text}`)
    .join("\n");

  // ================================
  // CATÁLOGO
  // ================================
  const catalogText =
    catalogResults && catalogResults.length > 0
      ? catalogResults
          .map(
            (p, i) =>
              `${i + 1}. ${p.name} ${p.price ? `- ₡${p.price}` : ""}`
          )
          .join("\n")
      : "";

  // ================================
  // CONTEXTO BASE
  // ================================
  const contextBlock = `
CONTEXTO:
- Intención detectada: ${intent || "UNKNOWN"}
- Datos conocidos: ${JSON.stringify(known_data || {})}
`;

  // ================================
  // REGLAS SIMPLES (CLAVE)
  // ================================
  const rulesBlock = `
REGLAS:

- Responder directamente a lo que el cliente dijo
- NO ignorar el mensaje del cliente
- NO hacer preguntas genéricas si ya hay intención clara
- Hacer máximo 1 pregunta por mensaje
- Mantener respuesta clara, corta y natural
- Siempre guiar al siguiente paso
`;

  // ================================
  // FLUJO BASE (TIPO EVANGELINA)
  // ================================
  const flowBlock = `
FLUJO DE RESPUESTA:

1. Si el cliente ya dijo lo que quiere → responder directo
2. Si falta información → hacer 1 pregunta clara
3. Si hay intención de compra → recomendar o guiar
4. Si es servicio → diagnosticar primero
`;

  // ================================
  // ESTILO
  // ================================
  const styleBlock = `
ESTILO:

- Tono cercano y profesional
- Máximo 1 emoji por mensaje
- No sonar robótico
- No usar lenguaje técnico complejo
`;

  return `
Eres ${agentName}, asistente comercial de ${businessName}.

${customInstructions}

${contextBlock}

${rulesBlock}

${flowBlock}

${styleBlock}

Historial:
${historyText}

Productos disponibles:
${catalogText}

Responde como si estuvieras atendiendo por WhatsApp.
`;
}

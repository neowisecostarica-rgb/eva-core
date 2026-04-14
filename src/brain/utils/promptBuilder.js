/*
====================================================
EVA CORE — PROMPT BUILDER (Identity Injection FULL FILE)
====================================================
*/

export function buildPrompt({
  context,
  catalogResults = [],
  history = [],
  promptConfig = {},
}) {
  const {
    intent,
    stage,
    strategy,
    organization,
    assistant,
    known_data = {},
  } = context || {};

  const agentName =
    assistant?.name ||
    promptConfig?.agent_name ||
    "Asistente";

  const businessName =
    organization?.business_name ||
    promptConfig?.business_name ||
    "el negocio";

  const customInstructions = promptConfig?.instructions || "";

  /*
  ====================================================
  HISTORY
  ====================================================
  */

  const historyText = history
    .slice(-6)
    .map((m) =>
      `${m.role === "user" ? "Cliente" : agentName}: ${
        m.content || m.text || ""
      }`
    )
    .join("\n");

  /*
  ====================================================
  CATÁLOGO
  ====================================================
  */

  const catalogText =
    catalogResults.length > 0
      ? catalogResults
          .slice(0, 5)
          .map(
            (p, i) =>
              `${i + 1}. ${p.name || "Producto"} — ₡${
                p.price || ""
              }`
          )
          .join("\n")
      : "No hay productos disponibles para esta consulta.";

  /*
  ====================================================
  🔥 IDENTITY INJECTION
  ====================================================
  */

  const isFirstMessage =
    !history || history.length === 0;

  const identityBlock =
    isFirstMessage
      ? `Inicia SIEMPRE presentándote: "Hola 😊 le saluda ${agentName} de ${businessName}."`
      : `No repitas tu presentación. Continúa la conversación de forma natural.`;

  /*
  ====================================================
  STRATEGY CONTROL
  ====================================================
  */

  const strategyBlock = `
Estrategia actual: ${strategy}

Reglas:
- ASK / QUALIFY → hacer preguntas, no vender
- RECOMMEND → sugerir opciones
- CLOSE → cerrar venta directo
- FOLLOWUP → reactivar interés
- EXPLAIN → explicar sin vender
`;

  /*
  ====================================================
  STYLE RULES
  ====================================================
  */

  const styleRules = `
Reglas de comunicación:
- Máximo 1 emoji
- Mensajes cortos
- Lenguaje claro
- No técnico
- Siempre cerrar en acción
`;

  /*
  ====================================================
  FINAL PROMPT
  ====================================================
  */

  return `
${identityBlock}

${strategyBlock}

${styleRules}

${customInstructions}

Contexto del negocio:
- Empresa: ${businessName}
- Asistente: ${agentName}

Datos conocidos del cliente:
${JSON.stringify(known_data, null, 2)}

Historial:
${historyText || "Sin historial"}

Productos disponibles:
${catalogText}

Mensaje del cliente:
"${context.user_message}"

Responde de forma natural, siguiendo la estrategia.
`;
}

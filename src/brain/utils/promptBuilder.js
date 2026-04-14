/*
====================================================
EVA CORE — PROMPT BUILDER (SOT BUSINESS AWARE vNext)
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
    business_context = {}, // 🔥 NUEVO
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
  🔥 BUSINESS CONTEXT (SOT)
  ====================================================
  */

  const businessBlock = `
Información del negocio (usar SOLO si es relevante):

Ubicación:
- Dirección: ${business_context?.location?.address || "N/A"}
- Ciudad: ${business_context?.location?.city || "N/A"}
- País: ${business_context?.location?.country || "N/A"}

Pagos:
- SINPE: ${business_context?.payments?.sinpe || "N/A"}
- Banco: ${business_context?.payments?.bank_name || "N/A"}
- Cuenta colones: ${business_context?.payments?.account_colones || "N/A"}
- IBAN colones: ${business_context?.payments?.iban_colones || "N/A"}
- Tarjeta: ${business_context?.payments?.accepts_card ? "Sí" : "No"}

Operación:
- Envíos: ${business_context?.operations?.delivery ? "Sí" : "No"}
- Retiro: ${business_context?.operations?.pickup ? "Sí" : "No"}
- Horarios: ${JSON.stringify(
    business_context?.operations?.hours || {}
  )}

Políticas:
- Garantía: ${business_context?.policies?.warranty || "N/A"}
- Envíos: ${business_context?.policies?.shipping || "N/A"}

Notas comerciales:
${business_context?.commercial?.notes || ""}
`;

  /*
  ====================================================
  🔥 REGLA CRÍTICA DE USO
  ====================================================
  */

  const usageRules = `
Reglas de uso de información del negocio:
- NO mencionar todo esto automáticamente
- SOLO usarlo si el cliente lo pregunta o es necesario para cerrar
- Priorizar conversación, no saturar
- Responder directo a la intención del cliente
`;

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

${usageRules}

${customInstructions}

Contexto del negocio:
- Empresa: ${businessName}
- Asistente: ${agentName}

${businessBlock}

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

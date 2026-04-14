/*
====================================================
EVA CORE — PROMPT BUILDER (SOT ENFORCED vFINAL)
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
    business_context = {},
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
  🔥 SOT ENFORCEMENT (CLAVE)
  ====================================================
  */

  const sotRules = `
REGLA CRÍTICA (NO ROMPER):
- La información del negocio proporcionada es la fuente oficial
- NUNCA contradigas esos datos
- NUNCA inventes información diferente
- SI el cliente pregunta algo relacionado con:
  pagos, ubicación, envíos, horarios, garantía
  → RESPONDE usando esos datos EXACTAMENTE
- NO uses conocimiento general si existe información del negocio
`;

  /*
  ====================================================
  🔥 BUSINESS CONTEXT (FUENTE DE VERDAD)
  ====================================================
  */

  const businessBlock = `
DATOS OFICIALES DEL NEGOCIO:

Ubicación:
Dirección: ${business_context?.location?.address || "N/A"}
Ciudad: ${business_context?.location?.city || "N/A"}
País: ${business_context?.location?.country || "N/A"}

Pagos:
SINPE: ${business_context?.payments?.sinpe || "N/A"}
Banco: ${business_context?.payments?.bank_name || "N/A"}
Cuenta colones: ${business_context?.payments?.account_colones || "N/A"}
IBAN colones: ${business_context?.payments?.iban_colones || "N/A"}
Tarjeta: ${business_context?.payments?.accepts_card ? "Sí" : "No"}

Operación:
Envíos: ${business_context?.operations?.delivery ? "Sí" : "No"}
Retiro: ${business_context?.operations?.pickup ? "Sí" : "No"}
Horarios: ${JSON.stringify(
    business_context?.operations?.hours || {}
  )}

Políticas:
Garantía: ${business_context?.policies?.warranty || "N/A"}
Envíos: ${business_context?.policies?.shipping || "N/A"}

Notas:
${business_context?.commercial?.notes || ""}
`;

  /*
  ====================================================
  🔥 IDENTITY
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
  STRATEGY
  ====================================================
  */

  const strategyBlock = `
Estrategia actual: ${strategy}

Reglas:
- ASK / QUALIFY → hacer preguntas
- RECOMMEND → sugerir
- CLOSE → cerrar
- FOLLOWUP → reactivar
- EXPLAIN → explicar
`;

  /*
  ====================================================
  STYLE
  ====================================================
  */

  const styleRules = `
Reglas de comunicación:
- Máximo 1 emoji
- Mensajes cortos
- Lenguaje claro
- Siempre cerrar en acción
`;

  /*
  ====================================================
  FINAL
  ====================================================
  */

  return `
${identityBlock}

${sotRules}

${strategyBlock}

${styleRules}

${customInstructions}

Contexto:
Empresa: ${businessName}
Asistente: ${agentName}

${businessBlock}

Datos cliente:
${JSON.stringify(known_data, null, 2)}

Historial:
${historyText || "Sin historial"}

Productos:
${catalogText}

Mensaje:
"${context.user_message}"

Responde correctamente usando los datos del negocio cuando aplique.
`;
}

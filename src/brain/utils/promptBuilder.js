export function buildPrompt({
  context,
  catalogResults = [],
  history = [],
  promptConfig = {},
}) {
  const {
    intent,
    strategy,
    stage,
    organization,
    sales_radar,
    force_mode = null,
    known_data = {},
  } = context || {};

  const agentName = organization?.assistant_name || "Asistente";
  const businessName = organization?.business_name || "el negocio";

  const customInstructions = promptConfig?.instructions || "";

  // ================================
  // HISTORY
  // ================================
  const historyText = history
    .map((m) => `${m.role === "user" ? "Cliente" : agentName}: ${m.text}`)
    .join("\n");

  // ================================
  // CATALOG
  // ================================
  const catalogText =
    catalogResults && catalogResults.length > 0
      ? catalogResults
          .map(
            (p, i) =>
              `${i + 1}. ${p.name} - ${p.price ? `₡${p.price}` : ""}`
          )
          .join("\n")
      : "No hay productos disponibles.";

  // ================================
  // CONTEXT BLOCK (CRÍTICO)
  // ================================
  const contextBlock = `
CONTEXTO ACTUAL:
- Intento: ${intent || "UNKNOWN"}
- Etapa: ${stage || "UNKNOWN"}
- Datos conocidos: ${JSON.stringify(known_data || {})}
`;

  // ================================
  // STRATEGY BLOCK
  // ================================
  let strategyBlock = "";

  if (strategy === "OPEN") {
    strategyBlock = `
ESTRATEGIA: APERTURA
- Saluda natural
- Haz 1 pregunta
- NO recomendar productos
`;
  } else if (strategy === "ASK" || strategy === "ASK_DIAGNOSIS") {
    strategyBlock = `
ESTRATEGIA: DIAGNÓSTICO
- Pregunta claro
- NO vender
- NO precios
`;
  } else if (strategy === "QUALIFY") {
    strategyBlock = `
ESTRATEGIA: CALIFICACIÓN
- Entender necesidad
- Preguntar uso/contexto
- NO recomendar aún
`;
  } else if (strategy === "RECOMMEND") {
    strategyBlock = `
ESTRATEGIA: RECOMENDACIÓN
- Sugiere opciones
- Explica por qué
- Guía decisión
`;
  } else if (strategy === "EXPLAIN") {
    strategyBlock = `
ESTRATEGIA: EXPLICACIÓN
- Claro
- Sin técnico
`;
  } else if (strategy === "EXPLAIN_CLOSE") {
    strategyBlock = `
ESTRATEGIA: EXPLICAR Y CERRAR
- Explica breve
- Lleva a acción
`;
  } else if (strategy === "CLOSE") {
    strategyBlock = `
ESTRATEGIA: CIERRE
- Acción clara
- Compra / visita / apartado
`;
  } else if (strategy === "FOLLOWUP") {
    strategyBlock = `
ESTRATEGIA: SEGUIMIENTO
- Retomar conversación
- Invitar a continuar
`;
  } else {
    strategyBlock = `
ESTRATEGIA: GENERAL
- Responder útil
- Mantener conversación
`;
  }

  // ================================
  // INTENT BLOCK (EXPANDIDO)
  // ================================
  let intentBlock = "";

  if (intent === "SERVICE") {
    intentBlock = `
CONTEXTO: SERVICIO
- Diagnosticar primero
- NO explicar de una
- Llevar a revisión
`;
  }

  if (intent === "BUY") {
    intentBlock = `
CONTEXTO: COMPRA
- Entender necesidad
- No vender de inmediato si falta info
`;
  }

  if (intent === "INFO") {
    intentBlock = `
CONTEXTO: INFORMACIÓN
- Responder claro
- Mantener conversación activa
`;
  }

  if (intent === "FOLLOWUP") {
    intentBlock = `
CONTEXTO: SEGUIMIENTO
- Retomar interés
- Empujar siguiente paso
`;
  }

  // ================================
  // FORCE MODE
  // ================================
  let forceBlock = "";

  if (force_mode === "QUALIFY_ONLY") {
    forceBlock = `
MODO FORZADO:
- SOLO preguntas
- NO vender
- NO precios
`;
  }

  // ================================
  // RESPONSE RULES (CRÍTICO)
  // ================================
  const rulesBlock = `
REGLAS DE RESPUESTA:
- No saturar con información
- Primero entender, luego explicar
- Máximo 1 pregunta por mensaje
- No dar precios sin contexto
- Adaptarse a la etapa del cliente
- Siempre guiar hacia una acción
`;

  // ================================
  // ANTI DUMP CONTROL
  // ================================
  const antiDumpBlock =
    stage === "EARLY"
      ? `
CONTROL:
- Respuesta corta
- Priorizar pregunta
`
      : "";

  // ================================
  // SALES RADAR
  // ================================
  const radarBlock = sales_radar
    ? `
SALES RADAR:
${sales_radar}
`
    : "";

  return `
Eres ${agentName}, asistente comercial de ${businessName}.

${customInstructions}

${contextBlock}

${intentBlock}

${strategyBlock}

${forceBlock}

${rulesBlock}

${antiDumpBlock}

${radarBlock}

Historial:
${historyText}

Productos disponibles:
${catalogText}

Responde natural, claro y directo.
`;
}

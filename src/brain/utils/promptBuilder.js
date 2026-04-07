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
  } = context || {};

  const agentName = organization?.assistant_name || "Asistente";
  const businessName = organization?.business_name || "el negocio";

  const customInstructions = promptConfig?.instructions || "";

  const historyText = history
    .map((m) => `${m.role === "user" ? "Cliente" : agentName}: ${m.text}`)
    .join("\n");

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
  // 🧠 STRATEGY CONTROL (FIXED)
  // ================================
  let strategyBlock = "";

  if (strategy === "OPEN") {
    strategyBlock = `
ESTRATEGIA: APERTURA

- Saluda de forma natural
- Haz 1 pregunta para entender necesidad
- NO recomiendes productos aún
`;
  }

  else if (strategy === "ASK" || strategy === "ASK_DIAGNOSIS") {
    strategyBlock = `
ESTRATEGIA: DIAGNÓSTICO

- Haz preguntas claras sobre el problema
- NO vendas productos
- NO menciones precios
- Enfócate en entender el caso
`;
  }

  else if (strategy === "QUALIFY") {
    strategyBlock = `
ESTRATEGIA: CALIFICACIÓN

- Profundiza en necesidad
- Pregunta uso, contexto o presupuesto
- NO recomiendes productos aún
`;
  }

  else if (strategy === "RECOMMEND") {
    strategyBlock = `
ESTRATEGIA: RECOMENDACIÓN

- Sugiere 1 a 3 opciones
- Explica por qué encajan
- Guía a decisión
`;
  }

  else if (strategy === "EXPLAIN") {
    strategyBlock = `
ESTRATEGIA: EXPLICACIÓN

- Responde claro
- Sin exceso técnico
`;
  }

  else if (strategy === "EXPLAIN_CLOSE") {
    strategyBlock = `
ESTRATEGIA: EXPLICAR Y CERRAR

- Explica breve
- Recomienda acción
`;
  }

  else if (strategy === "CLOSE") {
    strategyBlock = `
ESTRATEGIA: CIERRE

- Indica siguiente paso claro
- compra / apartado / coordinación
`;
  }

  else if (strategy === "FOLLOWUP") {
    strategyBlock = `
ESTRATEGIA: SEGUIMIENTO

- Retoma conversación
- Invita a continuar
`;
  }

  else {
    strategyBlock = `
ESTRATEGIA: GENERAL

- Responde útil
- Mantén conversación activa
`;
  }

  // ================================
  // 🧠 INTENT CONTROL (NUEVO)
  // ================================
  let intentBlock = "";

  if (intent === "SERVICE") {
    intentBlock = `
CONTEXTO: SERVICIO TÉCNICO

- El cliente busca reparación o mantenimiento
- NO vender productos
- NO asumir compra
- Diagnosticar primero
- Llevar a:
  - revisión
  - visita
  - traer equipo
`;
  }

  // ================================
  // 🚨 FORCE MODE
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

  return `
Eres ${agentName}, asistente comercial de ${businessName}.

${customInstructions}

${intentBlock}

${strategyBlock}

${forceBlock}

${sales_radar || ""}

Historial:
${historyText}

Productos disponibles:
${catalogText}

Responde natural, claro y directo.
Máximo 1 pregunta por mensaje.
Guía siempre al siguiente paso.
`;
}

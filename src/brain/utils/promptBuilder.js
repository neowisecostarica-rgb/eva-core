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
  // 🧠 STRATEGY CONTROL (CORE)
  // ================================
  let strategyBlock = "";

  if (strategy === "ASK") {
    strategyBlock = `
ESTRATEGIA: SOLICITAR INFORMACIÓN

- Haz preguntas para entender al cliente
- NO recomiendes productos
- NO menciones precios
- Mantén la respuesta corta
- Termina con una pregunta
`;
  }

  if (strategy === "QUALIFY") {
    strategyBlock = `
ESTRATEGIA: CALIFICACIÓN

- Profundiza en la necesidad del cliente
- Pregunta sobre uso, presupuesto o contexto
- NO recomiendes productos todavía
- NO cierres la venta aún
`;
  }

  if (strategy === "RECOMMEND") {
    strategyBlock = `
ESTRATEGIA: RECOMENDACIÓN

- Sugiere 1 a 3 opciones del catálogo
- Explica brevemente por qué son adecuadas
- Mantén lenguaje simple
- Guía hacia una decisión
`;
  }

  if (strategy === "EXPLAIN") {
    strategyBlock = `
ESTRATEGIA: EXPLICACIÓN

- Responde la duda de forma clara
- No des demasiada información
- Evita lenguaje técnico complejo
`;
  }

  if (strategy === "EXPLAIN_CLOSE") {
    strategyBlock = `
ESTRATEGIA: EXPLICAR Y CERRAR

- Explica brevemente la situación
- Da una recomendación clara
- Sugiere acción inmediata
`;
  }

  if (strategy === "CLOSE") {
    strategyBlock = `
ESTRATEGIA: CIERRE

- El cliente está listo para comprar
- NO hagas más preguntas innecesarias
- Indica claramente el siguiente paso:
  - compra
  - apartado
  - coordinación
`;
  }

  if (strategy === "FOLLOWUP") {
    strategyBlock = `
ESTRATEGIA: SEGUIMIENTO

- Retoma la conversación de forma natural
- Menciona el interés previo
- Invita a continuar
`;
  }

  if (!strategyBlock) {
    strategyBlock = `
ESTRATEGIA: GENERAL

- Responde de forma útil
- Mantén la conversación activa
`;
  }

  // ================================
  // 🚨 FORCE MODE (OVERRIDE)
  // ================================
  let forceBlock = "";

  if (force_mode === "QUALIFY_ONLY") {
    forceBlock = `
MODO FORZADO:

- SOLO hacer preguntas
- NO recomendar productos
- NO mencionar precios
`;
  }

  return `
Eres ${agentName}, asistente comercial de ${businessName}.

${customInstructions}

${strategyBlock}

${forceBlock}

${sales_radar || ""}

Historial:
${historyText}

Productos disponibles:
${catalogText}

Responde de forma natural, clara y útil.
Evita sonar forzado.
Mantén mensajes cortos.
Siempre guía la conversación hacia el siguiente paso.
`;
}

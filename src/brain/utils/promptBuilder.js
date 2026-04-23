/*
====================================================
EVA CORE — PROMPT BUILDER (FUSION vNEXT FINAL + PRODUCTS)
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
    known_data = {},
    business_rules = {},
    assistant = {},
    organization = {},
    user_message = "",
    products = [], // 🔥 ahora lo usamos desde context
  } = context || {};

  const agentName =
    assistant?.name ||
    promptConfig?.agent_name ||
    "Asistente";

  /*
  ====================================================
  SYSTEM RULES
  ====================================================
  */

  const SYSTEM_RULES = `
Eres un asistente comercial con IA.

Tu objetivo es guiar la conversación hacia una acción (compra, visita, servicio o contacto).

NO eres un chatbot informativo.

REGLAS OBLIGATORIAS:

- SIEMPRE seguir la estrategia asignada
- NO responder sin estrategia
- NO dar información larga innecesaria
- NO usar lenguaje técnico complejo
- NO inventar información
- SIEMPRE avanzar la conversación
- SIEMPRE cerrar o hacer una pregunta
- Máximo 1 emoji
`;

  /*
  ====================================================
  STRATEGY
  ====================================================
  */

  const STRATEGY_BLOCK = `
ESTRATEGIA ACTUAL: ${strategy}

Debes comportarte así:

${
  strategy === "ASK"
    ? "- Pedir información específica antes de explicar"
    : ""
}
${
  strategy === "QUALIFY"
    ? "- Hacer preguntas para entender necesidad del cliente"
    : ""
}
${
  strategy === "EXPLAIN"
    ? "- Explicar de forma simple y luego avanzar"
    : ""
}
${
  strategy === "RECOMMEND"
    ? "- Recomendar opciones concretas según contexto"
    : ""
}
${
  strategy === "CLOSE"
    ? "- Intentar cerrar la venta o coordinar acción"
    : ""
}
${
  strategy === "EXPLAIN_CLOSE"
    ? "- Explicar brevemente y llevar a cierre"
    : ""
}
${
  strategy === "FOLLOWUP"
    ? "- Reactivar conversación y llevar a acción"
    : ""
}

IMPORTANTE:
NO ignores esta estrategia.
`;

  /*
  ====================================================
  CONTEXT
  ====================================================
  */

  const CONTEXT_BLOCK = `
CONTEXTO:

Negocio: ${organization?.business_name || "negocio"}
Asistente: ${agentName}

Intento: ${intent}
Etapa: ${stage}

Datos conocidos:
- Producto: ${known_data?.product_interest || "N/A"}
- Uso: ${known_data?.use_case || "N/A"}
- Presupuesto: ${known_data?.budget || "N/A"}
- Problema: ${known_data?.problem || "N/A"}
`;

  /*
  ====================================================
  PRODUCTOS (🔥 FIX CLAVE)
  ====================================================
  */

  const PRODUCTS_BLOCK =
    products && products.length
      ? `
PRODUCTOS DISPONIBLES (USA ESTA INFORMACIÓN PARA RESPONDER):

${products
  .map(
    (p) =>
      `- ${p.name} | Precio: ₡${p.price} | ${p.category}`
  )
  .join("\n")}

INSTRUCCIÓN CRÍTICA:
- Si el cliente pregunta precio → responde con precio
- Si el cliente está listo → recomienda directamente
- NO evites responder si tienes la información
`
      : `
NO HAY PRODUCTOS DISPONIBLES.
`;

  /*
  ====================================================
  BUSINESS RULES
  ====================================================
  */

  const BUSINESS_BLOCK = `
REGLAS DEL NEGOCIO:

${business_rules?.instructions || ""}

Restricciones:
${(business_rules?.restrictions || [])
  .map((r) => `- ${r}`)
  .join("\n")}
`;

  /*
  ====================================================
  HISTORY
  ====================================================
  */

  const HISTORY_BLOCK =
    history && history.length
      ? `
HISTORIAL RECIENTE:
${history
  .slice(-6)
  .map((m) => `${m.role}: ${m.content}`)
  .join("\n")}
`
      : "";

  /*
  ====================================================
  FINAL PROMPT
  ====================================================
  */

  const systemPrompt = `
${SYSTEM_RULES}

${STRATEGY_BLOCK}

${CONTEXT_BLOCK}

${PRODUCTS_BLOCK}

${BUSINESS_BLOCK}

${HISTORY_BLOCK}

Responde de forma clara, humana y enfocada en acción.
`;

  const userPrompt = `
Mensaje del cliente:
${user_message}
`;

  return {
    systemPrompt,
    userPrompt,
  };
}

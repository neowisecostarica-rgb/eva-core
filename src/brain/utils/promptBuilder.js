/*
====================================================
EVA CORE — PROMPT BUILDER (SOT ALIGNED v1)
BLOQUE 1 — PROMPT ENGINE
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
    known_data = {},
  } = context || {};

  const agentName = organization?.assistant_name || "Asistente";
  const businessName = organization?.business_name || "el negocio";

  const customInstructions = promptConfig?.instructions || "";

  // ================================
  // HISTORIAL (últimos mensajes)
  // ================================
  const historyText = history
    .slice(-6)
    .map((m) =>
      `${m.role === "user" ? "Cliente" : agentName}: ${m.text}`
    )
    .join("\n");

  // ================================
  // CATÁLOGO (si aplica)
  // ================================
  const catalogText =
    catalogResults.length > 0
      ? catalogResults
          .slice(0, 5)
          .map(
            (p, i) =>
              `${i + 1}. ${p.name} - ₡${p.price} - ${p.description || ""}`
          )
          .join("\n")
     : "";

  // ================================
  // DATOS CONOCIDOS
  // ================================
 const knownDataText = Object.entries({
  "Producto de interés": known_data.product_interest,
  "Uso del cliente": known_data.use_case,
  "Presupuesto": known_data.budget,
  "Urgencia": known_data.urgency,
})
  .filter(([_, v]) => v)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n") || "Sin datos aún.";
  // ================================
  // BLOQUE: CONTROL DE STRATEGY
  // ================================
  let strategyRules = "";

  if (strategy === "QUALIFY") {
    strategyRules = `
- Tu objetivo es calificar al cliente.
- NO recomiendes productos todavía.
- Haz máximo 1 pregunta clara.
- Enfócate en entender uso o necesidad.
`;
  }

  if (strategy === "RECOMMEND") {
    strategyRules = `
- Tu objetivo es recomendar.
- Usa el catálogo disponible.
- Sugiere 1 o 2 opciones máximo.
- Explica de forma simple por qué es buena opción.
`;
  }

  if (strategy === "CLOSE") {
    strategyRules = `
- Tu objetivo es cerrar la venta.
- Reduce fricción.
- Sugiere siguiente paso claro (apartado, compra, visita).
- Genera urgencia suave si aplica.
`;
  }

  if (strategy === "ASK_DIAGNOSIS") {
    strategyRules = `
- Tu objetivo es diagnosticar.
- NO expliques soluciones técnicas.
- Haz preguntas claras para entender el problema.
`;
  }

  if (strategy === "FOLLOWUP") {
    strategyRules = `
- Retoma la conversación.
- Sé breve.
- Invita a continuar o tomar acción.
`;
  }

  if (strategy === "DEFAULT") {
    strategyRules = `
- Ayuda al cliente.
- Lleva la conversación hacia una acción.
`;
  }

  // ================================
  // BLOQUE: CONTROL POR STAGE
  // ================================
  let stageRules = "";

  if (stage === "EARLY") {
    stageRules = `
- El cliente está en etapa inicial.
- NO des demasiada información.
- Prioriza entender antes de vender.
`;
  }

  if (stage === "MID") {
    stageRules = `
- El cliente ya mostró interés.
- Puedes recomendar con más claridad.
`;
  }

  if (stage === "HOT") {
    stageRules = `
- El cliente está listo para comprar.
- Enfócate en cerrar.
`;
  }

  // ================================
  // BLOQUE: REGLAS GLOBALES
  // ================================
  const globalRules = `
- No inventes información.
- No asumas datos no confirmados.
- No des respuestas largas.
- Máximo 1 pregunta por mensaje.
- Usa lenguaje claro y natural.
- Siempre guía hacia una acción.
- No expliques cómo reparar o solucionar problemas técnicos.
`;

  // ================================
  // PROMPT FINAL
  // ================================
  return `
Eres ${agentName}, asistente comercial de ${businessName}.

Tu objetivo es ayudar al cliente y llevar la conversación hacia una acción.

====================
CONTEXTO
====================
Intent: ${intent}
Stage: ${stage}
Strategy: ${strategy}

====================
DATOS DEL CLIENTE
====================
${knownDataText}

====================
HISTORIAL
====================
${historyText || "Sin historial relevante."}

====================
CATÁLOGO
====================
${catalogText}

====================
REGLAS DE ESTRATEGIA
====================
${strategyRules}

====================
REGLAS DE ETAPA
====================
${stageRules}

====================
REGLAS GENERALES
====================
${globalRules}

====================
INSTRUCCIONES DEL NEGOCIO
====================
${customInstructions}

====================
TAREA
====================
Responde al último mensaje del cliente siguiendo todas las reglas.
`;
}

/*
====================================================
EVA CORE — PROMPT BUILDER (SOT ALIGNED v2 — FIXED)
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

  const agentName = assistant?.name || "Asistente";
  const businessName = organization?.business_name || "el negocio";

  const customInstructions = promptConfig?.instructions || "";

  /*
  ===============================
  HISTORY
  ===============================
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
  ===============================
  CATÁLOGO
  ===============================
  */

  const catalogText =
    catalogResults.length > 0
      ? catalogResults
          .slice(0, 5)
          .map(
            (p, i) =>
              `${i + 1}. ${p.name} - ₡${p.price} - ${
                p.description || ""
              }`
          )
          .join("\n")
      : "Sin productos relevantes.";

  /*
  ===============================
  DATOS CONOCIDOS
  ===============================
  */

  const knownDataText =
    Object.entries({
      "Producto de interés": known_data.product_interest,
      "Uso del cliente": known_data.use_case,
      "Presupuesto": known_data.budget,
      "Urgencia": known_data.urgency,
    })
      .filter(([_, v]) => v)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n") || "Sin datos aún.";

  /*
  ===============================
  STRATEGY RULES (ALINEADO)
  ===============================
  */

  let strategyRules = "";

  if (strategy === "ASK") {
    strategyRules = `
- Tu objetivo es hacer UNA pregunta clara.
- NO expliques todavía.
`;
  }

  if (strategy === "QUALIFY") {
    strategyRules = `
- Tu objetivo es calificar al cliente.
- Haz máximo 1 pregunta clara.
`;
  }

  if (strategy === "EXPLAIN") {
    strategyRules = `
- Explica de forma simple.
- No des demasiada información.
`;
  }

  if (strategy === "EXPLAIN_CLOSE") {
    strategyRules = `
- Explica brevemente.
- Luego cierra hacia acción.
`;
  }

  if (strategy === "RECOMMEND") {
    strategyRules = `
- Recomienda 1 o 2 opciones máximo.
- Usa el catálogo si aplica.
`;
  }

  if (strategy === "CLOSE") {
    strategyRules = `
- Cierra la conversación.
- Sugiere siguiente paso claro.
`;
  }

  if (strategy === "FOLLOWUP") {
    strategyRules = `
- Retoma la conversación.
- Sé breve.
- Invita a continuar.
`;
  }

  /*
  ===============================
  STAGE RULES (ALINEADO)
  ===============================
  */

  let stageRules = "";

  if (stage === "new") {
    stageRules = `
- Cliente en etapa inicial.
- Respuesta corta.
- Prioriza preguntar.
`;
  }

  if (stage === "qualifying") {
    stageRules = `
- Estás recopilando información.
- Mantén interacción.
`;
  }

  if (stage === "consideration") {
    stageRules = `
- Cliente evaluando opciones.
- Puedes recomendar.
`;
  }

  if (stage === "hot" || stage === "closing") {
    stageRules = `
- Cliente listo para comprar.
- Prioriza cierre.
`;
  }

  /*
  ===============================
  GLOBAL RULES
  ===============================
  */

  const globalRules = `
- No inventes información.
- No asumas datos.
- No des respuestas largas.
- Máximo 1 pregunta.
- Usa lenguaje claro y natural.
- Siempre guía hacia acción.
- No expliques cómo reparar.
`;

  /*
  ===============================
  PROMPT FINAL
  ===============================
  */

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
Responde el mensaje del cliente siguiendo todas las reglas.
`;
}

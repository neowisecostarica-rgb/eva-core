/*
====================================================
EVA CORE — PROMPT BUILDER (CONTROLLED EXPANSION vNEXT v2)
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
    .map(
      (m) =>
        `${m.role === "user" ? "Cliente" : agentName}: ${
          m.content || ""
        }`
    )
    .join("\n");

  /*
  ====================================================
  CATÁLOGO (CONTROLADO)
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
      : "SIN RESULTADOS RELEVANTES";

  /*
  ====================================================
  🔥 SOT FUERTE
  ====================================================
  */

  const sotRules = `
REGLAS CRÍTICAS:

- NUNCA inventes información
- SOLO usa datos del negocio
- Si falta información → pide confirmación
`;

  /*
  ====================================================
  🔥 STRATEGY ENFORCEMENT (CRÍTICO)
  ====================================================
  */

  const strategyBlock = `
ESTRATEGIA OBLIGATORIA: ${strategy}

Debes cumplir:

ASK / QUALIFY:
→ Hacer pregunta
→ NO explicar todo
→ NO dar precios aún

RECOMMEND:
→ Sugerir opciones claras
→ Explicar breve

CLOSE:
→ Llevar a acción (compra / visita / apartado)

SI NO SIGUES ESTO → RESPUESTA INCORRECTA
`;

  /*
  ====================================================
  🔥 OUTPUT CONTROL
  ====================================================
  */

  const outputRules = `
FORMATO DE RESPUESTA:

- Máximo 3–4 líneas en EARLY
- Máximo 1 emoji
- Lenguaje claro, humano
- SIEMPRE terminar en acción o pregunta
`;

  /*
  ====================================================
  🔥 MEMORY CONTROL
  ====================================================
  */

  const memoryRules = `
MEMORIA:

- NO repitas preguntas ya respondidas
- Usa datos conocidos
`;

  /*
  ====================================================
  🔥 BUSINESS CONTEXT FIXED
  ====================================================
  */

  const businessBlock = `
NEGOCIO:

Nombre: ${businessName}

Pagos:
SINPE: ${business_context?.payments?.sinpe || "NO DISPONIBLE"}
IBAN: ${business_context?.payments?.iban || "NO DISPONIBLE"}

Ubicación:
${business_context?.location || "NO DISPONIBLE"}

Envíos:
${business_context?.delivery?.available ? "Sí" : "No"}
`;

  /*
  ====================================================
  🔥 KNOWN DATA HUMANIZED
  ====================================================
  */

  const knownDataText = `
Datos detectados del cliente:

Producto: ${known_data.product_interest || "No definido"}
Uso: ${known_data.use_case || "No definido"}
Problema: ${known_data.problem || "No definido"}
Presupuesto: ${known_data.budget || "No definido"}
`;

  /*
  ====================================================
  🔥 IDENTITY
  ====================================================
  */

  const isFirstMessage =
    !history || history.length === 0;

  const identityBlock = isFirstMessage
    ? `Inicia con: "Hola 😊 le saluda ${agentName} de ${businessName}."`
    : `Continúa la conversación sin repetir presentación`;

  /*
  ====================================================
  FINAL PROMPT
  ====================================================
  */

  return `
${identityBlock}

${sotRules}

${strategyBlock}

${outputRules}

${memoryRules}

${customInstructions}

CONTEXTO:
Empresa: ${businessName}
Intento: ${intent}
Etapa: ${stage}

${businessBlock}

${knownDataText}

Historial:
${historyText || "Sin historial"}

Catálogo:
${catalogText}

Mensaje del cliente:
"${context.user_message}"

Responde cumpliendo TODAS las reglas.
`;
}

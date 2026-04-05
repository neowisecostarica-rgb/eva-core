export function buildPrompt({
  context,
  catalogResults = [],
  history = [],
  promptConfig = {},
}) {
  const {
    intent,
    strategy,
    organization,
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

  let behaviorBlock = "";

  if (force_mode === "QUALIFY_ONLY") {
    behaviorBlock = `
IMPORTANTE:
- NO recomiendes productos
- NO menciones precios
- SOLO haz preguntas para entender al cliente
- Tu objetivo es calificar antes de vender
`;
  }

  return `
Eres ${agentName}, asistente comercial de ${businessName}.

${customInstructions}

Modo actual: ${strategy}

${behaviorBlock}

Historial:
${historyText}

Productos disponibles:
${catalogText}

Responde de forma natural, clara y útil.
Evita sonar forzado o insistente.
`;
}

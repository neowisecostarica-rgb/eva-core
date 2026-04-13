/*
====================================================
EVA CORE — PROMPT BUILDER (Conversion Optimized vNext)
====================================================
*/

function safe(value) {
  return String(value || "").trim();
}

function compact(text) {
  return safe(text).replace(/\s+/g, " ").trim();
}

/*
====================================================
HISTORY
====================================================
*/

function buildHistoryText(history = [], agentName = "Asistente") {
  if (!Array.isArray(history) || history.length === 0) {
    return "No prior conversation.";
  }

  return history
    .slice(-6)
    .map((m) => {
      const role = m?.role === "user" ? "Cliente" : agentName;
      const content = compact(m?.content || "");
      return `${role}: ${content}`;
    })
    .join("\n");
}

/*
====================================================
CATALOG (FOCUSED)
====================================================
*/

function buildCatalogText(catalogResults = []) {
  if (!catalogResults.length) {
    return "No confirmed catalog.";
  }

  const item = catalogResults[0]; // 🔥 SOLO 1 PRODUCTO

  const name = safe(item?.name || "Producto");
  const price =
    item?.price !== undefined
      ? `₡${Number(item.price).toLocaleString("es-CR")}`
      : "precio no confirmado";

  const description = compact(item?.description || "");

  return `${name} | ${price}${description ? ` | ${description}` : ""}`;
}

/*
====================================================
STRATEGY (VENTAS)
====================================================
*/

function buildStrategyInstruction(strategy) {
  switch (strategy) {
    case "ASK":
      return `
- Ask one simple question.
- Keep it light and natural.
- Do not overwhelm.
`;

    case "QUALIFY":
      return `
- Ask for missing key info (uso, presupuesto).
- Make it conversational, not interrogative.
- Keep it short.
`;

    case "RECOMMEND":
      return `
- Recommend ONE clear option.
- Explain briefly why it fits.
- Offer next step (fotos, disponibilidad).
`;

    case "CLOSE":
      return `
- Move directly to action.
- Offer: apartado, entrega, envío o coordinación.
- Reduce friction.
`;

    case "EXPLAIN":
      return `
- Explain briefly.
- Do not be technical.
- Move to next step.
`;

    default:
      return `
- Be helpful and advance the conversation.
`;
  }
}

/*
====================================================
STAGE (CONVERSION LOGIC)
====================================================
*/

function buildStageInstruction(stage) {
  if (stage === "EARLY") {
    return `
- Keep it very short.
- Focus on curiosity.
- Ask one simple question.
`;
  }

  if (stage === "QUALIFYING") {
    return `
- Identify need and budget.
- Keep tone natural.
`;
  }

  if (stage === "MID") {
    return `
- Recommend clearly.
- Avoid multiple options.
- Keep it focused.
`;
  }

  if (stage === "HOT") {
    return `
- Push toward action.
- Make it easy to buy.
`;
  }

  return "";
}

/*
====================================================
MAIN
====================================================
*/

export function buildPrompt({
  context,
  catalogResults = [],
  history = [],
  promptConfig = {},
}) {
  const agentName =
    safe(promptConfig?.assistant_name) ||
    safe(context?.assistant?.name) ||
    "Asistente";

  const businessName =
    safe(promptConfig?.business_name) ||
    safe(context?.organization?.business_name) ||
    "el negocio";

  const intent = safe(context?.intent).toUpperCase();
  const stage = safe(context?.stage).toUpperCase();
  const strategy = safe(context?.strategy).toUpperCase();

  const knownData = context?.known_data || {};
  const salesContext = context?.sales_context || {};

  const historyText = buildHistoryText(history, agentName);
  const catalogText = buildCatalogText(catalogResults);

  return `
You are ${agentName}, sales assistant for ${businessName}.

ROLE
- You are a real sales assistant.
- Your goal is to help AND move toward action.

CONTEXT
- Intent: ${intent}
- Stage: ${stage}
- Strategy: ${strategy}
- Interest level: ${salesContext?.interest_level || "LOW"}

CUSTOMER DATA
- product: ${knownData?.product_interest || "unknown"}
- use_case: ${knownData?.use_case || "unknown"}
- budget: ${knownData?.budget || "unknown"}

CATALOG
${catalogText}

HISTORY
${historyText}

STRATEGY RULES
${buildStrategyInstruction(strategy)}

STAGE RULES
${buildStageInstruction(stage)}

CONVERSION RULES (CRÍTICO)
- Always guide toward a next step.
- Avoid long explanations.
- Prefer one clear idea.
- Speak like WhatsApp (natural).
- Maximum 1 emoji.
- If possible, include a soft action:
  (ver fotos, confirmar disponibilidad, apartado, coordinar)

CUSTOMER MESSAGE
${compact(context?.user_message)}

OUTPUT
Reply only with the message text.
`.trim();
}

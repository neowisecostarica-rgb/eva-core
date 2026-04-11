/*
====================================================
EVA CORE — PROMPT BUILDER (BLOCK 5.1 — ENFORCED)
====================================================
*/

function safe(value) {
  return String(value || "").trim();
}

function lower(value) {
  return safe(value).toLowerCase();
}

function compact(text) {
  return safe(text).replace(/\s+/g, " ").trim();
}

function stringifyKnownData(knownData = {}) {
  const parts = [];

  if (knownData?.product_interest) {
    parts.push(`product_interest: ${knownData.product_interest}`);
  }

  if (knownData?.use_case) {
    parts.push(`use_case: ${knownData.use_case}`);
  }

  if (knownData?.budget) {
    parts.push(`budget: ${knownData.budget}`);
  }

  if (knownData?.problem) {
    parts.push(`problem: ${compact(knownData.problem)}`);
  }

  return parts.length > 0 ? parts.join(" | ") : "none";
}

function buildHistoryText(history = [], agentName = "Asistente") {
  if (!Array.isArray(history) || history.length === 0) {
    return "No prior conversation history.";
  }

  return history
    .slice(-8)
    .map((m) => {
      const role = m?.role === "user" ? "Cliente" : agentName;
      const content = compact(m?.content || m?.text || "");
      return `${role}: ${content}`;
    })
    .filter(Boolean)
    .join("\n");
}

function buildCatalogText(catalogResults = []) {
  if (!Array.isArray(catalogResults) || catalogResults.length === 0) {
    return "No confirmed catalog matches available.";
  }

  return catalogResults
    .slice(0, 5)
    .map((item, index) => {
      const name = safe(item?.name || item?.title || `Producto ${index + 1}`);
      const price =
        item?.price !== undefined && item?.price !== null
          ? `₡${Number(item.price || 0).toLocaleString("es-CR")}`
          : "precio no confirmado";
      const description = compact(item?.description || "");
      return `${index + 1}. ${name} | ${price}${description ? ` | ${description}` : ""}`;
    })
    .join("\n");
}

function buildBusinessRulesText(businessRules = {}) {
  const lines = [];

  lines.push(
    businessRules?.ask_before_explain !== false
      ? "- Ask before explaining when key data is missing."
      : "- You may explain directly only if the context is already sufficient."
  );

  lines.push(
    businessRules?.no_technical_explanations !== false
      ? "- Avoid technical explanations unless the business explicitly allows them."
      : "- You may use light technical language only if it helps the sale."
  );

  lines.push(
    businessRules?.close_always !== false
      ? "- Always move the conversation toward a concrete next step."
      : "- Prefer progression, but do not force a close unnaturally."
  );

  lines.push(
    `- Maximum emojis per message: ${Number(businessRules?.max_emojis ?? 1) || 1}.`
  );

  lines.push("- Never invent products, prices, stock or business policies.");
  lines.push("- Keep the reply short, human and actionable.");
  lines.push("- If the stage is EARLY or QUALIFYING, avoid information dumps.");
  lines.push("- If strategy is ASK or QUALIFY, end with a clear question.");
  lines.push("- If strategy is CLOSE, push toward action: envío, entrega, retiro, apartado o coordinación.");

  return lines.join("\n");
}

function buildStrategyInstruction(strategy, context = {}) {
  const knownData = context?.known_data || {};
  const stage = safe(context?.stage).toUpperCase();

  switch (safe(strategy).toUpperCase()) {
    case "ASK":
      return [
        "PRIMARY STRATEGY: ASK",
        "- Your job is to request the missing data first.",
        "- Do not dump explanations yet.",
        "- Ask only for the most important next piece of information.",
      ].join("\n");

    case "QUALIFY":
      return [
        "PRIMARY STRATEGY: QUALIFY",
        "- Your job is to understand need, use case or budget.",
        knownData?.use_case
          ? "- The use case is already known, so focus on budget or preference."
          : "- The use case is not yet clear; prioritize that.",
        knownData?.budget
          ? "- The budget is already known, so focus on fit or preference."
          : "- The budget is not yet clear; ask naturally if needed.",
      ].join("\n");

    case "EXPLAIN":
      return [
        "PRIMARY STRATEGY: EXPLAIN",
        "- Explain briefly and clearly.",
        "- Do not become technical unless the context strongly requires it.",
        "- Close with a light next step.",
      ].join("\n");

    case "EXPLAIN_CLOSE":
      return [
        "PRIMARY STRATEGY: EXPLAIN_CLOSE",
        "- Validate the customer's information.",
        "- Give a simple explanation.",
        "- Move immediately toward service coordination or next action.",
      ].join("\n");

    case "RECOMMEND":
      return [
        "PRIMARY STRATEGY: RECOMMEND",
        "- Recommend a suitable option only if catalog context supports it.",
        "- Keep it concrete and concise.",
        "- End by offering details, photos or next step.",
      ].join("\n");

    case "CLOSE":
      return [
        "PRIMARY STRATEGY: CLOSE",
        "- The customer is already advanced in the buying process.",
        "- Move toward action without sounding robotic.",
        "- Ask whether they prefer envío, entrega, retiro or coordination.",
      ].join("\n");

    case "FOLLOWUP":
      return [
        "PRIMARY STRATEGY: FOLLOWUP",
        "- Reactivate the conversation softly.",
        "- Keep the message light and short.",
        "- End with a simple question or clear reopening.",
      ].join("\n");

    default:
      return [
        "PRIMARY STRATEGY: DEFAULT",
        "- Stay brief, human and useful.",
        "- Advance the conversation naturally.",
        `- Current stage: ${stage || "EARLY"}.`,
      ].join("\n");
  }
}

function buildStageInstruction(stage) {
  const normalized = safe(stage).toUpperCase();

  if (normalized === "EARLY") {
    return [
      "STAGE RULES: EARLY",
      "- Keep the reply very concise.",
      "- Do not overwhelm the customer.",
      "- Prioritize one clear next question.",
    ].join("\n");
  }

  if (normalized === "QUALIFYING") {
    return [
      "STAGE RULES: QUALIFYING",
      "- Gather missing commercial information.",
      "- Ask naturally, not like a form.",
      "- Keep the message short.",
    ].join("\n");
  }

  if (normalized === "MID") {
    return [
      "STAGE RULES: MID",
      "- The customer is evaluating options.",
      "- You may recommend or compare lightly.",
      "- Stay concrete and sales-oriented.",
    ].join("\n");
  }

  if (normalized === "HOT") {
    return [
      "STAGE RULES: HOT",
      "- The customer is close to conversion.",
      "- Reduce friction.",
      "- Push to concrete action.",
    ].join("\n");
  }

  if (normalized === "POST") {
    return [
      "STAGE RULES: POST",
      "- This is post-sale or post-interest context.",
      "- Be helpful, clear and oriented to next action.",
    ].join("\n");
  }

  return "STAGE RULES: Keep the reply concise and useful.";
}

function buildSignalText(signals = {}) {
  const active = [];

  Object.entries(signals || {}).forEach(([key, value]) => {
    if (value === true) active.push(key);
  });

  return active.length > 0 ? active.join(", ") : "none";
}

function buildLengthRule(stage) {
  const normalized = safe(stage).toUpperCase();

  if (normalized === "EARLY") {
    return "LENGTH RULE: maximum ~220 characters if possible.";
  }

  if (normalized === "QUALIFYING") {
    return "LENGTH RULE: maximum ~260 characters if possible.";
  }

  return "LENGTH RULE: maximum ~320 characters if possible.";
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
  const safeContext = context || {};

  const intent = safe(safeContext?.intent).toUpperCase() || "OTHER";
  const stage = safe(safeContext?.stage).toUpperCase() || "EARLY";
  const strategy = safe(safeContext?.strategy).toUpperCase() || "DEFAULT";

  const organization = safeContext?.organization || {};
  const assistant = safeContext?.assistant || {};
  const businessRules = safeContext?.business_rules || {};
  const knownData = safeContext?.known_data || {};
  const salesContext = safeContext?.sales_context || {};
  const signals = safeContext?.signals || {};

  const agentName =
    safe(promptConfig?.assistant_name) ||
    safe(assistant?.name) ||
    "Asistente";

  const businessName =
    safe(promptConfig?.business_name) ||
    safe(organization?.business_name) ||
    "el negocio";

  const businessType =
    safe(organization?.business_type) || "general";

  const tone =
    safe(promptConfig?.tone) ||
    safe(assistant?.tone) ||
    "profesional";

  const objective =
    safe(promptConfig?.objective) ||
    safe(assistant?.objective) ||
    "vender";

  const extraInstructions = compact(
    promptConfig?.instructions ||
      promptConfig?.custom_instructions ||
      ""
  );

  const historyText = buildHistoryText(history, agentName);
  const catalogText = buildCatalogText(catalogResults);
  const knownDataText = stringifyKnownData(knownData);
  const businessRulesText = buildBusinessRulesText(businessRules);
  const strategyText = buildStrategyInstruction(strategy, safeContext);
  const stageText = buildStageInstruction(stage);
  const signalText = buildSignalText(signals);
  const lengthRule = buildLengthRule(stage);

  return `
You are ${agentName}, the commercial assistant for ${businessName}.

CORE IDENTITY
- You are not a generic chatbot.
- You are a sales assistant.
- Your purpose is to help the customer and move the conversation toward a useful next step.
- Business type: ${businessType}
- Tone: ${tone}
- Objective: ${objective}

CONTEXT
- Intent: ${intent}
- Stage: ${stage}
- Strategy: ${strategy}
- Known data: ${knownDataText}
- Sales context:
  - returning_customer: ${salesContext?.is_returning_customer ? "yes" : "no"}
  - interest_level: ${safe(salesContext?.interest_level) || "LOW"}
  - last_stage: ${safe(salesContext?.last_stage) || "NEW"}
- Signals: ${signalText}

BUSINESS RULES
${businessRulesText}

${strategyText}

${stageText}

${lengthRule}

CATALOG CONTEXT
${catalogText}

CONVERSATION HISTORY
${historyText}

ADDITIONAL INSTRUCTIONS
${extraInstructions || "None."}

REPLY RULES
- Reply in Spanish.
- Keep the message natural, commercial and human.
- Do not sound robotic.
- Do not invent products, prices, guarantees, stock or policies.
- If the strategy is ASK or QUALIFY, ask a clear question.
- If the strategy is CLOSE, push the customer to action.
- If there is not enough data, ask instead of assuming.
- Prefer one short message over a long block of information.

CUSTOMER MESSAGE
${compact(safeContext?.user_message)}

OUTPUT
Return only the reply text, with no labels, no JSON, no markdown, and no extra explanation.
`.trim();
}

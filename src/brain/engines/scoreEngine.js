/*
====================================================
EVA CORE — SCORE ENGINE (SOT ALIGNED vNext)
====================================================
Responsabilidad:
Calcular score comercial real del lead basado en señales del sistema.

Reglas:
- NO accede a DB
- NO tiene side effects
- SOLO calcula y devuelve resultado
====================================================
*/

export function calculateScore({
  lead = {},
  context = {},
  lastMessages = [],
  now = Date.now(),
}) {
  let score = 0;
  const signals = [];
  const reasoning = [];

  const intent = context?.intent;
  const known = context?.known_data || {};
  const interestLevel =
    context?.sales_context?.interest_level ||
    lead?.interest_level ||
    "LOW";

  /*
  ====================================================
  INTENT
  ====================================================
  */

  if (intent === "BUY") {
    score += 25;
    signals.push("intent_buy");
  } else if (intent === "SERVICE") {
    score += 15;
    signals.push("intent_service");
  } else if (intent === "INFO") {
    score += 10;
    signals.push("intent_info");
  } else if (intent === "GREETING") {
    score += 5;
    signals.push("intent_greeting");
  }

  /*
  ====================================================
  INTEREST LEVEL
  ====================================================
  */

  if (interestLevel === "HIGH") {
    score += 25;
    signals.push("interest_high");
  } else if (interestLevel === "MEDIUM") {
    score += 15;
    signals.push("interest_medium");
  } else {
    score += 5;
    signals.push("interest_low");
  }

  /*
  ====================================================
  KNOWN DATA
  ====================================================
  */

  if (known?.product_interest) {
    score += 10;
    signals.push("product_interest");
  }

  if (known?.budget) {
    score += 15;
    signals.push("budget_detected");
  }

  if (known?.use_case) {
    score += 10;
    signals.push("use_case_detected");
  }

  /*
  ====================================================
  ACTIVITY
  ====================================================
  */

  const lastContact = lead?.last_contact_at
    ? new Date(lead.last_contact_at).getTime()
    : null;

  if (lastContact) {
    const hours = (now - lastContact) / (1000 * 60 * 60);

    if (hours < 2) {
      score += 5;
      signals.push("recent_activity");
    } else if (hours > 72) {
      score -= 20;
      signals.push("inactive_72h");
    } else if (hours > 24) {
      score -= 10;
      signals.push("inactive_24h");
    }
  }

  /*
  ====================================================
  MESSAGE INTENSITY
  ====================================================
  */

  if (lastMessages.length >= 3) {
    score += 10;
    signals.push("multi_message_engagement");
  }

  /*
  ====================================================
  TEXT SIGNALS (simple heuristics)
  ====================================================
  */

  const lastText =
    lastMessages?.[lastMessages.length - 1]?.text?.toLowerCase() || "";

  if (
    lastText.includes("precio") ||
    lastText.includes("cuanto cuesta") ||
    lastText.includes("vale")
  ) {
    score += 10;
    signals.push("price_interest");
  }

  if (
    lastText.includes("tarjeta") ||
    lastText.includes("sinpe") ||
    lastText.includes("transferencia") ||
    lastText.includes("envio")
  ) {
    score += 15;
    signals.push("payment_delivery_interest");
  }

  /*
  ====================================================
  CLAMP SCORE
  ====================================================
  */

  score = Math.max(0, Math.min(100, score));

  /*
  ====================================================
  LABEL
  ====================================================
  */

  let label = "COLD";

  if (score >= 85) label = "READY";
  else if (score >= 65) label = "HOT";
  else if (score >= 40) label = "WARM";

  /*
  ====================================================
  STAGE SUGGESTION
  ====================================================
  */

  let stage_suggested = "EARLY";

  if (score >= 85) stage_suggested = "HOT";
  else if (score >= 65) stage_suggested = "MID";
  else if (score >= 40) stage_suggested = "QUALIFYING";

  /*
  ====================================================
  OUTPUT
  ====================================================
  */

  return {
    score,
    label,
    stage_suggested,
    signals,
    reasoning,
  };
}

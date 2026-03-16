/*
====================================================
SCORE ENGINE
Lead Score + Stage Calculator
====================================================

Responsabilidades:

• Calcular score comercial del lead
• Traducir score a stage comercial
• Mantener lógica simple, estable y extensible
• No tocar DB
• No generar side effects

Reglas v1:

Base de score:
- intent BUY / PURCHASE / BUY_INTENT -> alto
- product_interest detectado -> suma
- use_case detectado -> suma
- budget detectado -> suma
- interest_level -> suma
- objection -> resta un poco
- closing_intent -> suma fuerte
- pipeline_event -> suma contextual

Cap del score:
0 a 100

Stages oficiales v1:
- new
- qualified
- interested
- considering
- hot
- won
- lost
====================================================
*/

function normalizeValue(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function clampScore(value = 0) {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

function scoreFromIntent(intent) {
  const normalized = normalizeValue(intent);

  if (
    normalized === "buy" ||
    normalized === "purchase" ||
    normalized === "buy_intent" ||
    normalized === "price_check" ||
    normalized === "availability"
  ) {
    return 35;
  }

  if (
    normalized === "info" ||
    normalized === "specs_request" ||
    normalized === "browsing"
  ) {
    return 15;
  }

  if (
    normalized === "support" ||
    normalized === "greeting"
  ) {
    return 5;
  }

  return 0;
}

function scoreFromInterestLevel(interestLevel) {
  const normalized = normalizeValue(interestLevel);

  if (normalized === "high") return 20;
  if (normalized === "medium") return 10;
  if (normalized === "low") return 4;

  return 0;
}

function scoreFromPipelineEvent(pipelineEvent) {
  const normalized = normalizeValue(pipelineEvent);

  const eventScores = {
    asked_price: 15,
    asked_availability: 15,
    asked_specs: 8,
    asked_payment: 25,
    wants_to_buy: 30,
    wants_reservation: 30,
    requested_photos: 10,
    requested_location: 10,
    followup_candidate: 5,
    objection_detected: -5,
    ghost_risk: -10,
    won: 100,
    lost: 0
  };

  if (Object.prototype.hasOwnProperty.call(eventScores, normalized)) {
    return eventScores[normalized];
  }

  return 0;
}

function detectWonFromSignals({ closingIntent, pipelineEvent, intent, text = "" }) {
  const normalizedText = normalizeValue(text);
  const normalizedIntent = normalizeValue(intent);
  const normalizedPipelineEvent = normalizeValue(pipelineEvent);

  if (normalizedPipelineEvent === "won") return true;

  if (
    normalizedText.includes("ya pague") ||
    normalizedText.includes("ya pagué") ||
    normalizedText.includes("comprobante") ||
    normalizedText.includes("te hice el sinpe") ||
    normalizedText.includes("ya hice el pago")
  ) {
    return true;
  }

  if (
    normalizeValue(closingIntent) === "payment_confirmed" ||
    normalizeValue(closingIntent) === "paid"
  ) {
    return true;
  }

  if (normalizedIntent === "won") return true;

  return false;
}

function detectLostFromSignals({ pipelineEvent, text = "" }) {
  const normalizedText = normalizeValue(text);
  const normalizedPipelineEvent = normalizeValue(pipelineEvent);

  if (normalizedPipelineEvent === "lost") return true;

  if (
    normalizedText.includes("ya no") ||
    normalizedText.includes("ya compre") ||
    normalizedText.includes("ya compré") ||
    normalizedText.includes("ya resolvi") ||
    normalizedText.includes("ya resolví") ||
    normalizedText.includes("gracias ya no")
  ) {
    return true;
  }

  return false;
}

export function calculateLeadScore({
  intent = null,
  product_interest = null,
  use_case = null,
  budget = null,
  interest_level = null,
  objection = null,
  closing_intent = null,
  pipeline_event = null,
  text = ""
}) {
  let score = 0;

  score += scoreFromIntent(intent);

  if (hasValue(product_interest)) score += 20;
  if (hasValue(use_case)) score += 10;
  if (hasValue(budget)) score += 15;

  score += scoreFromInterestLevel(interest_level);
  score += scoreFromPipelineEvent(pipeline_event);

  if (hasValue(objection)) {
    score -= 8;
  }

  if (hasValue(closing_intent)) {
    score += 20;
  }

  if (detectLostFromSignals({ pipelineEvent: pipeline_event, text })) {
    score = 10;
  }

  if (detectWonFromSignals({ closingIntent: closing_intent, pipelineEvent: pipeline_event, intent, text })) {
    score = 100;
  }

  return clampScore(score);
}

export function calculateLeadStage({
  score = 0,
  pipeline_event = null,
  text = ""
}) {
  const normalizedPipelineEvent = normalizeValue(pipeline_event);
  const normalizedText = normalizeValue(text);

  if (
    normalizedPipelineEvent === "won" ||
    normalizedText.includes("ya pague") ||
    normalizedText.includes("ya pagué") ||
    normalizedText.includes("te hice el sinpe") ||
    normalizedText.includes("ya hice el pago")
  ) {
    return "won";
  }

  if (
    normalizedPipelineEvent === "lost" ||
    normalizedText.includes("ya no") ||
    normalizedText.includes("gracias ya no") ||
    normalizedText.includes("ya compre") ||
    normalizedText.includes("ya compré")
  ) {
    return "lost";
  }

  if (score >= 85) return "hot";
  if (score >= 70) return "considering";
  if (score >= 50) return "interested";
  if (score >= 30) return "qualified";

  return "new";
}

export function calculateCommercialState(signals = {}) {
  const score = calculateLeadScore(signals);
  const stage = calculateLeadStage({
    score,
    pipeline_event: signals.pipeline_event,
    text: signals.text
  });

  return {
    score,
    stage
  };
}

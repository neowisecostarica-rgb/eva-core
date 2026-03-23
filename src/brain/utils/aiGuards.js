/**
 * AI GUARDS
 * Valida y protege las respuestas generadas por la IA
 */

const ALLOWED_INTENTS = [
  "BUY_INTENT",
  "INFO",
  "SUPPORT",
  "GREETING",
  "UNKNOWN"
];

const ALLOWED_STAGES = [
  "UNQUALIFIED",
  "QUALIFYING",
  "RECOMMENDING",
  "CLOSING"
];

/**
 * Limpia texto antes de enviarlo al cliente
 */
export function sanitizeAIReply(text = "") {
  if (!text || typeof text !== "string") return "";

  let clean = text.trim();

  // remover exceso de saltos
  clean = clean.replace(/\n{3,}/g, "\n\n");

  // evitar respuestas absurdamente largas
  if (clean.length > 1000) {
    clean = clean.slice(0, 1000);
  }

  return clean;
}

/**
 * Detecta patrones peligrosos (hallucination básica)
 */
function detectUnsafeContent(reply = "") {
  const lower = reply.toLowerCase();

  const forbiddenPatterns = [
    "100% garantizado",
    "te aseguro",
    "sin ningún riesgo",
    "totalmente gratis",
    "precio especial solo para ti",
    "descuento exclusivo sin autorización"
  ];

  for (const pattern of forbiddenPatterns) {
    if (lower.includes(pattern)) {
      return {
        unsafe: true,
        reason: `FORBIDDEN_PATTERN_${pattern}`
      };
    }
  }

  return { unsafe: false };
}

/**
 * Valida estructura y contenido del JSON de la IA
 */
export function validateAIResult(data, options = {}) {
  const { confidenceThreshold = 0.75 } = options;

  const errors = [];

  if (!data || typeof data !== "object") {
    return {
      ok: false,
      reason: "INVALID_FORMAT",
      errors: ["Response is not an object"]
    };
  }

  // ===== reply =====
  if (!data.reply || typeof data.reply !== "string") {
    errors.push("Missing or invalid reply");
  }

  // ===== intent =====
  if (!ALLOWED_INTENTS.includes(data.intent)) {
    errors.push(`Invalid intent: ${data.intent}`);
  }

  // ===== stage =====
  if (!ALLOWED_STAGES.includes(data.stage)) {
    errors.push(`Invalid stage: ${data.stage}`);
  }

  // ===== confidence =====
  if (typeof data.confidence !== "number") {
    errors.push("Confidence must be a number");
  }

  // ===== entities =====
  if (data.entities && typeof data.entities !== "object") {
    errors.push("Entities must be an object");
  }

  // ===== suggested_actions =====
  if (
    data.suggested_actions &&
    !Array.isArray(data.suggested_actions)
  ) {
    errors.push("suggested_actions must be an array");
  }

  // ===== escalate =====
  if (typeof data.escalate_to_human !== "boolean") {
    errors.push("escalate_to_human must be boolean");
  }

  // ===== contenido peligroso =====
  const unsafeCheck = detectUnsafeContent(data.reply || "");
  if (unsafeCheck.unsafe) {
    errors.push(`Unsafe content detected: ${unsafeCheck.reason}`);
  }

  // ===== confidence muy baja =====
  if (data.confidence < confidenceThreshold) {
    errors.push("Low confidence");
  }

  if (errors.length > 0) {
    return {
      ok: false,
      reason: "VALIDATION_FAILED",
      errors
    };
  }

  return {
    ok: true,
    data: {
      reply: data.reply,
      intent: data.intent,
      confidence: data.confidence,
      stage: data.stage,
      entities: data.entities || {},
      suggested_actions: data.suggested_actions || [],
      escalate_to_human: data.escalate_to_human,
      reason: data.reason || ""
    }
  };
}

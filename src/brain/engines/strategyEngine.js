/*
====================================================
EVA BRAIN — STRATEGY ENGINE
====================================================

Responsabilidad:
Decidir la estrategia comercial ANTES de responder.

Este módulo:
- normaliza intent
- normaliza stage
- decide estrategia
- devuelve una razón trazable

No genera texto.
No llama IA.
No toca DB.
Solo decide.

====================================================
*/

import { normalizeText } from "../utils/textUtils.js";

/*
====================================================
NORMALIZERS
====================================================
*/

export function normalizeStage(stage = "") {
  const safeStage = normalizeText(stage);

  if (safeStage === "new" || safeStage === "early") return "new";
  if (safeStage === "qualifying") return "qualifying";
  if (safeStage === "consideration" || safeStage === "mid") return "consideration";
  if (safeStage === "hot" || safeStage === "ready_to_buy") return "hot";
  if (safeStage === "closing") return "closing";
  if (safeStage === "post") return "post";

  return "new";
}

export function normalizeIntent(intent = "") {
  const safeIntent = String(intent || "").toUpperCase().trim();

  if (safeIntent === "SUPPORT") return "SERVICE";
  if (safeIntent === "BUY") return "BUY";
  if (safeIntent === "INFO") return "INFO";
  if (safeIntent === "GREETING") return "GREETING";
  if (safeIntent === "FOLLOWUP") return "FOLLOWUP";
  if (safeIntent === "CLOSE_INTENT") return "CLOSE_INTENT";
  if (safeIntent === "SERVICE") return "SERVICE";

  return "OTHER";
}

/*
====================================================
HELPERS
====================================================
*/

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function hasServiceDiagnosis(known_data = {}) {
  return (
    hasValue(known_data.problem) ||
    hasValue(known_data.issue) ||
    hasValue(known_data.model) ||
    hasValue(known_data.brand) ||
    hasValue(known_data.diagnosis)
  );
}

function hasCommercialQualification(known_data = {}) {
  return (
    hasValue(known_data.use_case) ||
    hasValue(known_data.budget) ||
    hasValue(known_data.product_interest) ||
    hasValue(known_data.product_type)
  );
}

/*
====================================================
DECISION
====================================================
*/

export function decideStrategy({ intent, stage, known_data = {} }) {
  const normalizedIntent = normalizeIntent(intent);
  const normalizedStage = normalizeStage(stage);

  /*
  SERVICE FLOW
  */

  if (normalizedIntent === "SERVICE") {
    if (!hasServiceDiagnosis(known_data)) {
      return {
        intent: normalizedIntent,
        stage: normalizedStage,
        strategy: "ASK",
        reason: "service_missing_diagnosis",
      };
    }

    return {
      intent: normalizedIntent,
      stage: normalizedStage,
      strategy: "EXPLAIN_CLOSE",
      reason: "service_with_diagnosis",
    };
  }

  /*
  FOLLOWUP FLOW
  */

  if (normalizedIntent === "FOLLOWUP") {
    return {
      intent: normalizedIntent,
      stage: normalizedStage,
      strategy: "FOLLOWUP",
      reason: "followup_detected",
    };
  }

  /*
  CLOSING FLOW
  */

  if (normalizedIntent === "CLOSE_INTENT") {
    return {
      intent: normalizedIntent,
      stage: normalizedStage,
      strategy: "CLOSE",
      reason: "explicit_close_intent",
    };
  }

  /*
  BUY FLOW
  */

  if (normalizedIntent === "BUY") {
    if (normalizedStage === "closing" || normalizedStage === "hot") {
      return {
        intent: normalizedIntent,
        stage: normalizedStage,
        strategy: "CLOSE",
        reason: "buy_hot_or_closing",
      };
    }

    if (normalizedStage === "consideration") {
      return {
        intent: normalizedIntent,
        stage: normalizedStage,
        strategy: "RECOMMEND",
        reason: "buy_consideration_stage",
      };
    }

    if (normalizedStage === "qualifying" && hasCommercialQualification(known_data)) {
      return {
        intent: normalizedIntent,
        stage: normalizedStage,
        strategy: "RECOMMEND",
        reason: "buy_qualified_enough_for_recommendation",
      };
    }

    return {
      intent: normalizedIntent,
      stage: normalizedStage,
      strategy: "QUALIFY",
      reason: "buy_needs_qualification",
    };
  }

  /*
  INFO FLOW
  */

  if (normalizedIntent === "INFO") {
    if (normalizedStage === "hot" || normalizedStage === "closing") {
      return {
        intent: normalizedIntent,
        stage: normalizedStage,
        strategy: "CLOSE",
        reason: "info_request_near_close",
      };
    }

    return {
      intent: normalizedIntent,
      stage: normalizedStage,
      strategy: "EXPLAIN",
      reason: "info_request",
    };
  }

  /*
  GREETING FLOW
  */

  if (normalizedIntent === "GREETING") {
    if (normalizedStage === "new") {
      return {
        intent: normalizedIntent,
        stage: normalizedStage,
        strategy: "ASK",
        reason: "greeting_new_conversation",
      };
    }

    return {
      intent: normalizedIntent,
      stage: normalizedStage,
      strategy: "QUALIFY",
      reason: "greeting_existing_context",
    };
  }

  /*
  FALLBACK
  */

  return {
    intent: normalizedIntent,
    stage: normalizedStage,
    strategy: "ASK",
    reason: "fallback_default",
  };
}

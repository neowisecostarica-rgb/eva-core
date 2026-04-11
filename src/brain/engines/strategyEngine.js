/*
====================================================
EVA BRAIN — STRATEGY ENGINE (v3 — ENFORCED)
====================================================
*/

import { normalizeText } from "../utils/textUtils.js";

/*
====================================================
NORMALIZERS
====================================================
*/

export function normalizeStage(stage = "") {
  const safe = normalizeText(stage);

  if (safe === "new" || safe === "early") return "EARLY";
  if (safe === "qualifying") return "QUALIFYING";
  if (safe === "mid" || safe === "consideration") return "MID";
  if (safe === "hot" || safe === "ready_to_buy") return "HOT";
  if (safe === "closing") return "HOT";
  if (safe === "post") return "POST";

  return "EARLY";
}

export function normalizeIntent(intent = "") {
  const safe = String(intent || "").toUpperCase().trim();

  if (safe === "SUPPORT") return "SERVICE";
  if (safe === "SERVICE") return "SERVICE";
  if (safe === "BUY") return "BUY";
  if (safe === "INFO") return "INFO";
  if (safe === "GREETING") return "GREETING";
  if (safe === "FOLLOWUP") return "FOLLOWUP";
  if (safe === "CLOSE_INTENT") return "CLOSE_INTENT";

  return "OTHER";
}

/*
====================================================
HELPERS
====================================================
*/

function hasValue(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function hasDiagnosis(data = {}) {
  return (
    hasValue(data.problem) ||
    hasValue(data.issue) ||
    hasValue(data.model) ||
    hasValue(data.brand)
  );
}

function hasQualification(data = {}) {
  return (
    hasValue(data.use_case) ||
    hasValue(data.budget) ||
    hasValue(data.product_interest)
  );
}

function hasStrongQualification(data = {}) {
  return (
    hasValue(data.use_case) &&
    hasValue(data.budget)
  );
}

/*
====================================================
DECISION ENGINE
====================================================
*/

export function decideStrategy({
  intent,
  stage,
  known_data = {},
  sales_context = {},
  signals = {},
}) {
  const i = normalizeIntent(intent);
  const s = normalizeStage(stage);
  const d = known_data || {};
  const sc = sales_context || {};
  const sg = signals || {};

  const interest = String(sc.interest_level || "LOW").toUpperCase();

  /*
  ============================
  SERVICE
  ============================
  */

  if (i === "SERVICE") {
    if (!hasDiagnosis(d)) {
      return { strategy: "ASK", reason: "service_missing_diagnosis" };
    }

    return { strategy: "EXPLAIN_CLOSE", reason: "service_with_diagnosis" };
  }

  /*
  ============================
  FOLLOWUP
  ============================
  */

  if (i === "FOLLOWUP") {
    return { strategy: "FOLLOWUP", reason: "followup" };
  }

  /*
  ============================
  CLOSE INTENT
  ============================
  */

  if (i === "CLOSE_INTENT") {
    return { strategy: "CLOSE", reason: "explicit_close" };
  }

  /*
  ============================
  BUY FLOW
  ============================
  */

  if (i === "BUY") {
    // 🔥 PRIORIDAD: INTERÉS ALTO
    if (interest === "HIGH" || sg.is_hot) {
      return { strategy: "CLOSE", reason: "high_intent_close" };
    }

    if (s === "HOT") {
      return { strategy: "CLOSE", reason: "buy_hot" };
    }

    if (s === "MID") {
      return { strategy: "RECOMMEND", reason: "buy_mid" };
    }

    if (hasStrongQualification(d)) {
      return { strategy: "RECOMMEND", reason: "ready_for_recommend" };
    }

    if (hasQualification(d)) {
      return { strategy: "QUALIFY", reason: "partial_qualification" };
    }

    return { strategy: "QUALIFY", reason: "needs_qualification" };
  }

  /*
  ============================
  INFO FLOW
  ============================
  */

  if (i === "INFO") {
    if (s === "HOT" || interest === "HIGH") {
      return { strategy: "CLOSE", reason: "info_hot" };
    }

    if (!hasQualification(d)) {
      return { strategy: "QUALIFY", reason: "info_needs_context" };
    }

    return { strategy: "EXPLAIN", reason: "info_with_context" };
  }

  /*
  ============================
  GREETING
  ============================
  */

  if (i === "GREETING") {
    return { strategy: "QUALIFY", reason: "start_conversation" };
  }

  /*
  ============================
  FALLBACK
  ============================
  */

  return { strategy: "ASK", reason: "fallback" };
}

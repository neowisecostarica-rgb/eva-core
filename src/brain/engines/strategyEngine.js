/*
====================================================
EVA BRAIN — STRATEGY ENGINE (FIXED v2)
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

export function decideStrategy({ intent, stage, known_data = {} }) {
  const i = normalizeIntent(intent);
  const s = normalizeStage(stage);
  const d = known_data || {};

  /*
  ============================
  SERVICE FLOW
  ============================
  */

  if (i === "SERVICE") {
    if (!hasDiagnosis(d)) {
      return {
        intent: i,
        stage: s,
        strategy: "ASK",
        reason: "service_missing_diagnosis",
      };
    }

    return {
      intent: i,
      stage: s,
      strategy: "EXPLAIN_CLOSE",
      reason: "service_with_diagnosis",
    };
  }

  /*
  ============================
  FOLLOWUP
  ============================
  */

  if (i === "FOLLOWUP") {
    return {
      intent: i,
      stage: s,
      strategy: "FOLLOWUP",
      reason: "followup",
    };
  }

  /*
  ============================
  CLOSE INTENT
  ============================
  */

  if (i === "CLOSE_INTENT") {
    return {
      intent: i,
      stage: s,
      strategy: "CLOSE",
      reason: "explicit_close",
    };
  }

  /*
  ============================
  BUY FLOW
  ============================
  */

  if (i === "BUY") {
    // 🔥 HOT → CIERRE
    if (s === "HOT") {
      return {
        intent: i,
        stage: s,
        strategy: "CLOSE",
        reason: "buy_hot",
      };
    }

    // 🔥 MID → RECOMENDAR
    if (s === "MID") {
      return {
        intent: i,
        stage: s,
        strategy: "RECOMMEND",
        reason: "buy_mid",
      };
    }

    // 🔥 QUALIFIED → RECOMENDAR
    if (s === "QUALIFYING" && hasStrongQualification(d)) {
      return {
        intent: i,
        stage: s,
        strategy: "RECOMMEND",
        reason: "qualified_ready_for_recommend",
      };
    }

    // 🔥 SI TIENE ALGO DE DATA → SEGUIR CALIFICANDO
    if (hasQualification(d)) {
      return {
        intent: i,
        stage: s,
        strategy: "QUALIFY",
        reason: "partial_qualification",
      };
    }

    // 🔥 DEFAULT BUY → QUALIFY
    return {
      intent: i,
      stage: s,
      strategy: "QUALIFY",
      reason: "buy_needs_qualification",
    };
  }

  /*
  ============================
  INFO FLOW
  ============================
  */

  if (i === "INFO") {
    // 🔥 SI ESTÁ CERCA DE CIERRE → CERRAR
    if (s === "HOT") {
      return {
        intent: i,
        stage: s,
        strategy: "CLOSE",
        reason: "info_hot",
      };
    }

    // 🔥 SI NO TIENE CONTEXTO → CALIFICAR
    if (!hasQualification(d)) {
      return {
        intent: i,
        stage: s,
        strategy: "QUALIFY",
        reason: "info_needs_context",
      };
    }

    // 🔥 YA TIENE CONTEXTO → EXPLICAR
    return {
      intent: i,
      stage: s,
      strategy: "EXPLAIN",
      reason: "info_with_context",
    };
  }

  /*
  ============================
  GREETING
  ============================
  */

  if (i === "GREETING") {
    return {
      intent: i,
      stage: s,
      strategy: "QUALIFY",
      reason: "greeting_start_conversation",
    };
  }

  /*
  ============================
  FALLBACK
  ============================
  */

  return {
    intent: i,
    stage: s,
    strategy: "ASK",
    reason: "fallback",
  };
}

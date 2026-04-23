/*
====================================================
EVA BRAIN — STRATEGY ENGINE (CONTROLLED FINAL AUTHORITY)
====================================================
*/

/*
====================================================
NORMALIZERS
====================================================
*/

function normalizeIntent(intent = "") {
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

function normalizeStage(stage = "") {
  const s = String(stage || "").toUpperCase().trim();

  if (["NEW", "EARLY"].includes(s)) return "EARLY";
  if (["QUALIFYING"].includes(s)) return "QUALIFYING";
  if (["MID", "CONSIDERATION"].includes(s)) return "MID";
  if (["HOT", "READY_TO_BUY", "CLOSING"].includes(s)) return "HOT";
  if (["POST"].includes(s)) return "POST";

  return "EARLY";
}

/*
====================================================
HELPERS
====================================================
*/

function hasValue(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  return true;
}

function detectCloseSignal(text = "") {
  const t = String(text).toLowerCase();

  return [
    "quiero",
    "me interesa",
    "lo quiero",
    "como pago",
    "sinpe",
    "tarjeta",
    "transferencia",
    "apartar",
    "reservar",
    "coordinar",
  ].some((k) => t.includes(k));
}

/*
====================================================
STAGE INFERENCE (SIMPLIFICADO)
====================================================
*/

function inferStage({ intent, known_data = {}, text = "", stage }) {
  const i = normalizeIntent(intent);

  if (i === "GREETING") return "EARLY";
  if (i === "FOLLOWUP") return "POST";
  if (i === "CLOSE_INTENT") return "HOT";

  if (i === "SERVICE") {
    if (!known_data?.problem) return "QUALIFYING";
    return "MID";
  }

  if (i === "BUY") {
    if (detectCloseSignal(text)) return "HOT";

    if (hasValue(known_data?.budget) && hasValue(known_data?.use_case)) {
      return "MID";
    }

    if (hasValue(known_data?.product_interest)) {
      return "QUALIFYING";
    }

    return "EARLY";
  }

  return normalizeStage(stage);
}

/*
====================================================
STRATEGY CORE
====================================================
*/

function decideCore({ intent, stage, known_data = {}, text = "" }) {
  const i = normalizeIntent(intent);
  const s = normalizeStage(stage);

  /*
  ============================
  SERVICE
  ============================
  */

  if (i === "SERVICE") {
    if (!known_data?.problem) {
      return { strategy: "ASK", reason: "service_needs_diagnosis" };
    }

    return { strategy: "EXPLAIN_CLOSE", reason: "service_ready" };
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
  CLOSE
  ============================
  */

  if (i === "CLOSE_INTENT" || detectCloseSignal(text)) {
    return { strategy: "CLOSE", reason: "close_signal" };
  }

  /*
  ============================
  BUY FLOW
  ============================
  */

  if (i === "BUY") {
    if (s === "HOT") {
      return { strategy: "CLOSE", reason: "buy_hot" };
    }

    if (s === "MID") {
      return { strategy: "RECOMMEND", reason: "buy_mid" };
    }

    if (known_data?.product_interest) {
      return { strategy: "QUALIFY", reason: "needs_more_info" };
    }

    return { strategy: "QUALIFY", reason: "early_buy" };
  }

  /*
  ============================
  INFO
  ============================
  */

  if (i === "INFO") {
    if (!known_data?.product_interest) {
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
    return { strategy: "ASK", reason: "start" };
  }

  /*
  ============================
  FALLBACK
  ============================
  */

  return { strategy: "ASK", reason: "fallback" };
}

/*
====================================================
PUBLIC API
====================================================
*/

export function decideStrategy({
  intent,
  stage,
  known_data = {},
  text = "",
}) {
  const normalizedIntent = normalizeIntent(intent);

  const finalStage = inferStage({
    intent: normalizedIntent,
    known_data,
    text,
    stage,
  });

  const decision = decideCore({
    intent: normalizedIntent,
    stage: finalStage,
    known_data,
    text,
  });

  return {
    intent: normalizedIntent,
    stage: finalStage,
    known_data,
    strategy: decision.strategy,
    reason: decision.reason,
  };
}

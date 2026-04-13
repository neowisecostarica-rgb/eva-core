/*
====================================================
EVA BRAIN — STRATEGY ENGINE (vNext — FINAL AUTHORITY)
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
TEXT HELPERS
====================================================
*/

function safeText(value) {
  return String(value || "").trim();
}

function lowerText(value) {
  return safeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function hasAny(text, patterns = []) {
  return patterns.some((pattern) => text.includes(pattern));
}

function hasValue(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/*
====================================================
CURRENT TURN EXTRACTION
====================================================
*/

export function extractCurrentTurnKnownData(text = "") {
  const raw = safeText(text);
  const t = lowerText(text);

  let budget = null;
  let use_case = null;
  let product_interest = null;
  let problem = null;

  const colon = raw.match(/₡\s*([\d.,]+)/i);
  if (colon?.[1]) {
    const value = Number(colon[1].replace(/[.,]/g, ""));
    budget = Number.isNaN(value) ? null : value;
  }

  if (!budget) {
    const mil = raw.match(/(\d{2,3})\s*mil\b/i);
    if (mil?.[1]) {
      const value = Number(mil[1]) * 1000;
      budget = Number.isNaN(value) ? null : value;
    }
  }

  if (!budget) {
    const numeric = raw.match(/\b(\d{5,7})\b/);
    if (numeric?.[1]) {
      const value = Number(numeric[1]);
      budget = Number.isNaN(value) ? null : value;
    }
  }

  if (hasAny(t, ["estudio", "colegio", "universidad", "tareas"])) {
    use_case = "STUDY";
  } else if (hasAny(t, ["trabajo", "oficina", "empresa"])) {
    use_case = "WORK";
  } else if (hasAny(t, ["diseño", "video", "render", "edicion"])) {
    use_case = "CREATIVE";
  } else if (hasAny(t, ["gaming", "jugar", "juegos"])) {
    use_case = "GAMING";
  }

  if (hasAny(t, ["laptop", "computadora", "pc"])) {
    product_interest = "LAPTOP";
  } else if (hasAny(t, ["impresora"])) {
    product_interest = "PRINTER";
  } else if (hasAny(t, ["monitor"])) {
    product_interest = "MONITOR";
  }

  if (
    hasAny(t, [
      "mantenimiento",
      "reparacion",
      "reparar",
      "no imprime",
      "no enciende",
      "no carga",
      "atascada",
      "lenta",
      "error",
    ])
  ) {
    problem = raw;
  }

  return {
    budget,
    use_case,
    product_interest,
    problem,
  };
}

export function mergeKnownData(memory = {}, current = {}) {
  return {
    budget: current?.budget ?? memory?.budget ?? null,
    use_case: current?.use_case ?? memory?.use_case ?? null,
    product_interest:
      current?.product_interest ?? memory?.product_interest ?? null,
    problem: current?.problem ?? memory?.problem ?? null,
  };
}

/*
====================================================
COMMERCIAL SIGNALS
====================================================
*/

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
  return hasValue(data.use_case) && hasValue(data.budget);
}

function detectCloseSignal(text = "") {
  const t = lowerText(text);

  return hasAny(t, [
    "quiero comprar",
    "la quiero",
    "lo quiero",
    "como pago",
    "sinpe",
    "tarjeta",
    "transferencia",
    "apartar",
    "reservar",
    "me la deja",
    "me lo deja",
    "voy con esa",
    "coordinar entrega",
    "cuando me la entrega",
    "quiero esa",
    "quiero ese",
  ]);
}

function detectBrowsingSignal(text = "") {
  const t = lowerText(text);

  return (
    t.length <= 20 ||
    hasAny(t, [
      "hola",
      "buenas",
      "buenos dias",
      "buenas tardes",
      "buenas noches",
      "busco",
      "informacion",
      "info",
      "disponible",
      "tienen",
    ])
  );
}

/*
====================================================
STAGE ENFORCEMENT
====================================================
*/

export function inferStageFromCurrentTurn({
  intent,
  text = "",
  known_data = {},
  prior_stage = "EARLY",
}) {
  const i = normalizeIntent(intent);
  const t = lowerText(text);
  const fallbackStage = normalizeStage(prior_stage);
  const hasClose = detectCloseSignal(text);
  const browsing = detectBrowsingSignal(text);
  const hasStrong = hasStrongQualification(known_data);
  const hasPartial = hasQualification(known_data);

  if (i === "GREETING") return "EARLY";
  if (i === "FOLLOWUP") return "POST";
  if (i === "CLOSE_INTENT") return "HOT";

  if (i === "SERVICE") {
    if (!hasDiagnosis(known_data)) return "QUALIFYING";
    return "MID";
  }

  if (i === "BUY") {
    if (hasClose) return "HOT";
    if (hasStrong) return "MID";
    if (hasPartial) return "QUALIFYING";
    if (browsing || t.length < 20) return "EARLY";
    return "QUALIFYING";
  }

  if (i === "INFO") {
    if (hasClose) return "HOT";
    if (hasStrong) return "MID";
    if (hasPartial) return "QUALIFYING";
    return "EARLY";
  }

  return fallbackStage;
}

/*
====================================================
STRATEGY DECISION
====================================================
*/

function pickStrategy({
  intent,
  stage,
  known_data = {},
  sales_context = {},
  signals = {},
  text = "",
}) {
  const i = normalizeIntent(intent);
  const s = normalizeStage(stage);
  const d = known_data || {};
  const sc = sales_context || {};
  const sg = signals || {};
  const interest = String(sc.interest_level || "LOW").toUpperCase();
  const hasClose = detectCloseSignal(text);

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
    if (hasClose) {
      return { strategy: "CLOSE", reason: "buy_close_signal" };
    }

    if (s === "HOT") {
      return { strategy: "CLOSE", reason: "buy_hot" };
    }

    if (interest === "HIGH" || sg.is_hot) {
      return { strategy: "RECOMMEND", reason: "high_intent_but_not_close_signal" };
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
    if (hasClose) {
      return { strategy: "CLOSE", reason: "info_close_signal" };
    }

    if (s === "HOT") {
      return { strategy: "RECOMMEND", reason: "info_hot_but_not_close_signal" };
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
    return { strategy: "ASK", reason: "start_conversation" };
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
PUBLIC DECISION API
====================================================
*/

export function decideStrategy({
  intent,
  stage,
  known_data = {},
  sales_context = {},
  signals = {},
  text = "",
}) {
  const normalizedIntent = normalizeIntent(intent);

  const currentTurnKnownData = extractCurrentTurnKnownData(text);
  const effectiveKnownData = mergeKnownData(known_data, currentTurnKnownData);

  const effectiveStage = inferStageFromCurrentTurn({
    intent: normalizedIntent,
    text,
    known_data: effectiveKnownData,
    prior_stage: stage,
  });

  const decision = pickStrategy({
    intent: normalizedIntent,
    stage: effectiveStage,
    known_data: effectiveKnownData,
    sales_context,
    signals,
    text,
  });

  return {
    intent: normalizedIntent,
    stage: effectiveStage,
    known_data: effectiveKnownData,
    strategy: decision.strategy,
    reason: decision.reason,
    current_turn_known_data: currentTurnKnownData,
  };
}

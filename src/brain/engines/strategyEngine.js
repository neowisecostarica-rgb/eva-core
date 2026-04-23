/*
====================================================
EVA BRAIN — STRATEGY ENGINE (FUSION vNEXT FINAL)
====================================================
*/

/*
====================================================
NORMALIZERS
====================================================
*/

export function normalizeStage(stage = "") {
  const s = String(stage || "").toUpperCase().trim();

  if (["NEW", "EARLY"].includes(s)) return "EARLY";
  if (["QUALIFYING"].includes(s)) return "QUALIFYING";
  if (["MID", "CONSIDERATION"].includes(s)) return "MID";
  if (["HOT", "READY_TO_BUY", "CLOSING"].includes(s)) return "HOT";
  if (["POST"].includes(s)) return "POST";

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

function lowerText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function hasAny(text, patterns = []) {
  return patterns.some((pattern) => text.includes(pattern));
}

/*
====================================================
SIGNALS (SE CONSERVAN)
====================================================
*/

function detectCloseSignal(text = "") {
  const t = lowerText(text);

  return hasAny(t, [
    "quiero comprar",
    "lo quiero",
    "como pago",
    "sinpe",
    "tarjeta",
    "transferencia",
    "apartar",
    "reservar",
    "coordinar",
    "me lo deja",
    "voy con esa",
  ]);
}

function detectBrowsingSignal(text = "") {
  const t = lowerText(text);

  return (
    t.length <= 20 ||
    hasAny(t, [
      "hola",
      "buenas",
      "info",
      "tienen",
      "disponible",
    ])
  );
}

/*
====================================================
CURRENT TURN DATA (SE CONSERVA)
====================================================
*/

export function extractCurrentTurnKnownData(text = "") {
  const raw = String(text || "").trim();
  const t = lowerText(text);

  let budget = null;
  let use_case = null;
  let product_interest = null;
  let problem = null;

  // presupuesto
  const colon = raw.match(/₡\s*([\d.,]+)/i);
  if (colon?.[1]) {
    const value = Number(colon[1].replace(/[.,]/g, ""));
    if (!Number.isNaN(value)) budget = value;
  }

  // uso
  if (hasAny(t, ["estudio", "colegio", "universidad"])) {
    use_case = "STUDY";
  } else if (hasAny(t, ["trabajo", "oficina"])) {
    use_case = "WORK";
  }

  // producto
  if (hasAny(t, ["laptop", "computadora", "pc"])) {
    product_interest = "LAPTOP";
  } else if (hasAny(t, ["impresora"])) {
    product_interest = "PRINTER";
  }

  // problema
  if (hasAny(t, ["no imprime", "error", "no enciende", "mantenimiento"])) {
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
STAGE INFERENCE (CONTROLADO + INTELIGENTE)
====================================================
*/

function inferStage({
  intent,
  text = "",
  known_data = {},
  prior_stage = "EARLY",
}) {
  const i = normalizeIntent(intent);
  const fallback = normalizeStage(prior_stage);
  const hasClose = detectCloseSignal(text);

  if (i === "GREETING") return "EARLY";
  if (i === "FOLLOWUP") return "POST";
  if (i === "CLOSE_INTENT") return "HOT";

  if (i === "SERVICE") {
    if (!hasValue(known_data.problem)) return "QUALIFYING";
    return "MID";
  }

  if (i === "BUY") {
    if (hasClose) return "HOT";

    if (hasValue(known_data.budget) && hasValue(known_data.use_case)) {
      return "MID";
    }

    if (hasValue(known_data.product_interest)) {
      return "QUALIFYING";
    }

    if (detectBrowsingSignal(text)) return "EARLY";

    return "QUALIFYING";
  }

  if (i === "INFO") {
    if (hasClose) return "HOT";
    if (hasValue(known_data.product_interest)) return "QUALIFYING";
    return "EARLY";
  }

  return fallback;
}

/*
====================================================
STRATEGY CORE (SIN SIMPLIFICAR)
====================================================
*/

function decideCore({ intent, stage, known_data = {}, text = "" }) {
  const i = normalizeIntent(intent);
  const s = normalizeStage(stage);
  const hasClose = detectCloseSignal(text);

  /*
  ============================
  SERVICE
  ============================
  */

  if (i === "SERVICE") {
    if (!hasValue(known_data.problem)) {
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

  if (i === "CLOSE_INTENT" || hasClose) {
    return { strategy: "CLOSE", reason: "close_signal" };
  }

  /*
  ============================
  BUY FLOW
  ============================
  */

  if (i === "BUY") {
    if (s === "HOT") return { strategy: "CLOSE", reason: "buy_hot" };
    if (s === "MID") return { strategy: "RECOMMEND", reason: "buy_mid" };

    if (hasValue(known_data.product_interest)) {
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
    if (!hasValue(known_data.product_interest)) {
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
PUBLIC API (FINAL)
====================================================
*/

export function decideStrategy({
  intent,
  stage,
  known_data = {},
  text = "",
}) {
  const normalizedIntent = normalizeIntent(intent);

  const currentTurn = extractCurrentTurnKnownData(text);
  const mergedData = mergeKnownData(known_data, currentTurn);

  const finalStage = inferStage({
    intent: normalizedIntent,
    text,
    known_data: mergedData,
    prior_stage: stage,
  });

  const decision = decideCore({
    intent: normalizedIntent,
    stage: finalStage,
    known_data: mergedData,
    text,
  });

  return {
    intent: normalizedIntent,
    stage: finalStage,
    known_data: mergedData,
    strategy: decision.strategy,
    reason: decision.reason,
    current_turn_known_data: currentTurn,
  };
}

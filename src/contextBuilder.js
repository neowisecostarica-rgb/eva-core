/*
====================================================
EVA CORE — CONTEXT BUILDER (BLOCK 2 — SOT ALIGNED)
====================================================
*/

import pool from "./db.js";

/*
====================================================
UTILS
====================================================
*/

function safe(v) {
  return String(v || "").trim();
}

function lower(v) {
  return safe(v).toLowerCase();
}

function hasAny(text, patterns = []) {
  return patterns.some((p) => lower(text).includes(p));
}

/*
====================================================
DETECTION (🔥 NUEVO OWNER)
====================================================
*/

function detectBudget(text) {
  const t = safe(text);

  const colon = t.match(/₡\s*([\d.,]+)/i);
  if (colon?.[1]) return Number(colon[1].replace(/[.,]/g, ""));

  const mil = t.match(/(\d{2,3})\s*mil\b/i);
  if (mil?.[1]) return Number(mil[1]) * 1000;

  const raw = t.match(/\b(\d{5,7})\b/);
  if (raw?.[1]) return Number(raw[1]);

  return null;
}

function detectUseCase(text) {
  const t = lower(text);

  if (hasAny(t, ["estudio", "colegio", "universidad"])) return "STUDY";
  if (hasAny(t, ["trabajo", "oficina", "empresa"])) return "WORK";
  if (hasAny(t, ["diseño", "video", "render"])) return "CREATIVE";
  if (hasAny(t, ["gaming", "jugar"])) return "GAMING";

  return null;
}

function detectProblem(text) {
  if (
    hasAny(text, [
      "no imprime",
      "no enciende",
      "error",
      "atascada",
      "lenta",
      "reparar",
      "mantenimiento",
    ])
  ) {
    return safe(text);
  }

  return null;
}

function detectProductInterest(text) {
  const t = lower(text);

  if (hasAny(t, ["laptop", "computadora"])) return "LAPTOP";
  if (hasAny(t, ["impresora"])) return "PRINTER";
  if (hasAny(t, ["monitor"])) return "MONITOR";

  return null;
}

function detectKnownData(text) {
  return {
    budget: detectBudget(text),
    use_case: detectUseCase(text),
    problem: detectProblem(text),
    product_interest: detectProductInterest(text),
  };
}

/*
====================================================
MERGE
====================================================
*/

function mergeKnownData(dbData = {}, detected = {}) {
  return {
    budget: detected.budget ?? dbData.budget ?? null,
    use_case: detected.use_case ?? dbData.use_case ?? null,
    product_interest:
      detected.product_interest ?? dbData.product_interest ?? null,
    problem: detected.problem ?? dbData.problem ?? null,
  };
}

/*
====================================================
MAIN
====================================================
*/

export async function buildContext({
  organization_id,
  phone,
  text = "",
  intent = null,
  stage = null,
}) {
  try {
    /*
    ========================================
    DB LOAD
    ========================================
    */

    const business = (
      await pool.query(
        `SELECT * FROM business_profile WHERE organization_id = $1 LIMIT 1`,
        [organization_id]
      )
    ).rows[0] || {};

    const config = (
      await pool.query(
        `SELECT * FROM prompt_config WHERE organization_id = $1 LIMIT 1`,
        [organization_id]
      )
    ).rows[0] || {};

    const lead = phone
      ? (
          await pool.query(
            `SELECT * FROM leads WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
            [organization_id, phone]
          )
        ).rows[0] || {}
      : {};

    /*
    ========================================
    DETECTION (🔥 CENTRALIZADO)
    ========================================
    */

    const detected = detectKnownData(text);

    /*
    ========================================
    MERGE
    ========================================
    */

    const known_data = mergeKnownData(lead, detected);

    /*
    ========================================
    FINAL CONTEXT
    ========================================
    */

    return {
      organization: {
        id: organization_id,
        business_name: business?.business_name || "el negocio",
      },

      assistant: {
        name: config?.assistant_name || "Asistente",
      },

      intent,
      stage,
      known_data,

      user_message: safe(text),

      sales_context: {
        interest_level: lead?.interest_level || "LOW",
      },

      history: [],
      signals: {},
    };
  } catch (err) {
    console.error("❌ CONTEXT ERROR", err);

    return {
      organization: { id: organization_id },
      assistant: { name: "Asistente" },
      intent,
      stage,
      known_data: detectKnownData(text),
      user_message: text,
      sales_context: {},
      history: [],
      signals: {},
    };
  }
}

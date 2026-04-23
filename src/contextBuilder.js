/*
====================================================
EVA CORE — CONTEXT BUILDER (FUSION vNEXT FINAL + PRODUCTS)
====================================================
*/

import pool from "./db.js";
import { detectIntent } from "./brain/engines/intentEngine.js";

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

function truthy(value) {
  const v = lower(value);
  return ["true", "1", "si", "sí", "yes"].includes(v);
}

function hasValue(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/*
====================================================
KNOWN DATA
====================================================
*/

function extractKnownData(text = "") {
  const t = lower(text);
  const raw = safe(text);

  let budget = null;
  let use_case = null;
  let product_interest = null;
  let problem = null;

  if (t.includes("trabajo")) use_case = "WORK";
  if (t.includes("estudio")) use_case = "STUDY";

  if (t.includes("laptop") || t.includes("computadora") || t.includes("pc")) {
    product_interest = "LAPTOP";
  }
  if (t.includes("impresora")) product_interest = "PRINTER";
  if (t.includes("monitor")) product_interest = "MONITOR";

  if (
    t.includes("no imprime") ||
    t.includes("error") ||
    t.includes("no enciende") ||
    t.includes("no carga") ||
    t.includes("lenta") ||
    t.includes("mantenimiento")
  ) {
    problem = raw;
  }

  const colon = raw.match(/₡\s*([\d.,]+)/i);
  if (colon?.[1]) {
    const val = Number(colon[1].replace(/[.,]/g, ""));
    if (!Number.isNaN(val)) budget = val;
  }

  return {
    budget,
    use_case,
    product_interest,
    problem,
  };
}

function mergeKnownData(detected, lead = {}) {
  return {
    budget: detected.budget ?? lead?.budget ?? null,
    use_case: detected.use_case ?? lead?.use_case ?? null,
    product_interest:
      detected.product_interest ?? lead?.product_interest ?? null,
    problem: detected.problem ?? lead?.problem ?? null,
  };
}

/*
====================================================
STAGE
====================================================
*/

function detectStage({ lead = {}, known_data }) {
  if (lead?.score >= 85) return "HOT";

  if (known_data.problem) return "QUALIFYING";

  if (
    hasValue(known_data.product_interest) &&
    hasValue(known_data.use_case) &&
    hasValue(known_data.budget)
  ) {
    return "MID";
  }

  if (known_data.product_interest) return "QUALIFYING";

  return "EARLY";
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
}) {
  try {
    const business =
      (
        await pool.query(
          `SELECT * FROM business_profile WHERE organization_id = $1 LIMIT 1`,
          [organization_id]
        )
      ).rows[0] || {};

    const config =
      (
        await pool.query(
          `SELECT * FROM prompt_config WHERE organization_id = $1 LIMIT 1`,
          [organization_id]
        )
      ).rows[0] || {};

    const lead =
      phone &&
      (
        await pool.query(
          `SELECT * FROM leads WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
          [organization_id, phone]
        )
      ).rows[0];

    /*
    ============================
    🟢 PRODUCTOS (FIX CLAVE)
    ============================
    */

    const products =
      (
        await pool.query(
          `
          SELECT name, description, price, category
          FROM product_catalog
          WHERE organization_id = $1
          AND is_active = true
          ORDER BY created_at DESC
          LIMIT 5
          `,
          [organization_id]
        )
      ).rows || [];

    /*
    ============================
    DATA
    ============================
    */

    const detected = extractKnownData(text);
    const known_data = mergeKnownData(detected, lead);
    const stage = detectStage({ lead, known_data });

    /*
    ============================
    OUTPUT
    ============================
    */

    return {
      organization: {
        id: organization_id,
        business_name: business?.business_name || "negocio",
      },

      assistant: {
        name: config?.agent_name || "Asistente",
      },

      intent: detectIntent(text),
      stage,
      known_data,
      user_message: safe(text),

      products, // 🔥 CLAVE

      business_rules: {},
      constraints: {},

      sales_context: {
        lead_score: lead?.score || 0,
      },
    };

  } catch (err) {
    console.error("❌ CONTEXT ERROR:", err);

    return {
      organization: { id: organization_id },
      assistant: { name: "Asistente" },
      intent: detectIntent(text),
      stage: "EARLY",
      known_data: {},
      products: [],
      user_message: safe(text),
    };
  }
}

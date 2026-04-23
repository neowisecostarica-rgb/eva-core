/*
====================================================
EVA CORE — CONTEXT BUILDER (FUSION vNEXT FINAL)
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
KNOWN DATA (ALINEADO CON STRATEGY ENGINE)
====================================================
*/

function extractKnownData(text = "") {
  const t = lower(text);
  const raw = safe(text);

  let budget = null;
  let use_case = null;
  let product_interest = null;
  let problem = null;

  // uso
  if (t.includes("trabajo")) use_case = "WORK";
  if (t.includes("estudio")) use_case = "STUDY";

  // producto
  if (t.includes("laptop") || t.includes("computadora") || t.includes("pc")) {
    product_interest = "LAPTOP";
  }
  if (t.includes("impresora")) product_interest = "PRINTER";
  if (t.includes("monitor")) product_interest = "MONITOR";

  // problema
  if (
    t.includes("no imprime") ||
    t.includes("error") ||
    t.includes("no enciende") ||
    t.includes("no carga") ||
    t.includes("lenta") ||
    t.includes("mantenimiento") ||
    t.includes("reparacion") ||
    t.includes("reparación")
  ) {
    problem = raw;
  }

  // presupuesto
  const colon = raw.match(/₡\s*([\d.,]+)/i);
  if (colon?.[1]) {
    const val = Number(colon[1].replace(/[.,]/g, ""));
    if (!Number.isNaN(val)) budget = val;
  }

  if (!budget) {
    const mil = raw.match(/(\d{2,3})\s*mil\b/i);
    if (mil?.[1]) {
      const val = Number(mil[1]) * 1000;
      if (!Number.isNaN(val)) budget = val;
    }
  }

  if (!budget) {
    const num = raw.match(/\b(\d{5,7})\b/);
    if (num?.[1]) {
      const val = Number(num[1]);
      if (!Number.isNaN(val)) budget = val;
    }
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
STAGE (COMPATIBLE CON STRATEGY ENGINE)
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
STRATEGY INPUTS (RECUPERADO)
====================================================
*/

function buildStrategyInputs({ known_data = {}, history = [], lead = {} }) {
  return {
    has_problem: !!known_data.problem,
    has_budget: !!known_data.budget,
    has_product_interest: !!known_data.product_interest,
    has_use_case: !!known_data.use_case,

    has_enough_info:
      !!known_data.product_interest &&
      (!!known_data.use_case || !!known_data.problem),

    needs_qualification:
      !known_data.use_case || !known_data.product_interest,

    can_close:
      !!known_data.product_interest &&
      !!known_data.budget,

    interaction_depth: history.length,
    repeat_user: history.length > 3,

    readiness_level:
      lead?.score >= 80
        ? "HIGH"
        : lead?.score >= 40
        ? "MEDIUM"
        : "LOW",
  };
}

/*
====================================================
PERSONA
====================================================
*/

function buildPersona(config = {}) {
  return {
    name: config?.agent_name || "Asistente",
    tone: config?.tone || "neutral_professional",
    emoji_policy: config?.emoji_policy || "max_1",
    communication_style: config?.communication_style || "concise",
    closing_style: config?.closing_style || "soft_close",
    restrictions: [
      "no_technical_explanations",
      "no_information_dump",
      "must_close_conversation",
    ],
  };
}

/*
====================================================
BUSINESS RULES (RECUPERADO COMPLETO)
====================================================
*/

function buildBusinessRules(config = {}, business = {}) {
  return {
    tone: config?.tone || "profesional cercano",
    emoji_policy: config?.emoji_policy || "max_1",
    communication_style: config?.communication_style || "concise",
    closing_style: config?.closing_style || "soft_close",
    instructions: config?.instructions || "",
    restrictions: [
      "no_invent_information",
      "use_only_business_data",
      "ask_if_missing_data",
      "must_close_or_ask",
      "max_1_emoji",
      "no_information_dump",
      "no_technical_explanations",
    ],
    business_name: business?.business_name || null,
  };
}

/*
====================================================
CONSTRAINTS (RECUPERADO COMPLETO)
====================================================
*/

function buildConstraints(config = {}, business = {}) {
  const deliveryConfigured =
    business?.delivery_available === true ||
    truthy(business?.delivery_available);

  return {
    max_lines_early: 4,
    max_lines_default: 5,
    max_emojis: 1,
    no_invent_information: true,
    ask_if_missing_data: true,
    must_close_or_ask: true,
    no_technical_explanations: true,
    no_information_dump: true,
    payments_available: {
      sinpe: !!business?.sinpe_number,
      iban: !!business?.iban,
    },
    delivery_available: deliveryConfigured,
    tone: config?.tone || "profesional cercano",
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
    HISTORY
    ============================
    */

    let history = [];

    if (phone) {
      const conv =
        (
          await pool.query(
            `
            SELECT id FROM conversations
            WHERE organization_id = $1
            AND external_user_id = $2
            ORDER BY updated_at DESC
            LIMIT 1
            `,
            [organization_id, phone]
          )
        ).rows[0];

      if (conv?.id) {
        const rows =
          (
            await pool.query(
              `
              SELECT role, content
              FROM messages
              WHERE conversation_id = $1
              ORDER BY created_at DESC
              LIMIT 12
              `,
              [conv.id]
            )
          ).rows || [];

        history = rows.reverse();
      }
    }

    /*
    ============================
    DATA
    ============================
    */

    const detected = extractKnownData(text);
    const known_data = mergeKnownData(detected, lead);

    const stage = detectStage({ lead, known_data });

    const strategy_inputs = buildStrategyInputs({
      known_data,
      history,
      lead,
    });

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

      persona: buildPersona(config),

      intent: detectIntent(text),

      stage,

      known_data,

      strategy_inputs,

      user_message: safe(text),

      history,

      business_rules: buildBusinessRules(config, business),

      constraints: buildConstraints(config, business),

      business_context: {
        name: business?.business_name || null,
        location: business?.location || null,
        payments: {
          sinpe: business?.sinpe_number || null,
          iban: business?.iban || null,
        },
        delivery: {
          available:
            business?.delivery_available === true ||
            truthy(business?.delivery_available),
        },
      },

      sales_context: {
        interest_level: lead?.interest_level || "LOW",
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
      strategy_inputs: {},
      history: [],
      business_rules: {},
      constraints: {},
      business_context: {},
      user_message: safe(text),
      sales_context: {
        interest_level: "LOW",
        lead_score: 0,
      },
    };
  }
}

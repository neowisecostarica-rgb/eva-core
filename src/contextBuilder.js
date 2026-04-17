/*
====================================================
EVA CORE — CONTEXT BUILDER (INTELLIGENCE vNEXT FIXED v2)
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

/*
====================================================
MERGE MEMORY (🔥 NUEVO)
====================================================
*/

function mergeKnownData(detected, lead = {}) {
  return {
    budget: detected.budget || lead?.budget || null,
    use_case: detected.use_case || lead?.use_case || null,
    problem: detected.problem || lead?.problem || null,
    product_interest:
      detected.product_interest || lead?.product_interest || null,
  };
}

/*
====================================================
DETECTION
====================================================
*/

function detectKnownData(text = "") {
  const t = lower(text);

  let use_case = null;
  let product_interest = null;
  let problem = null;
  let budget = null;

  if (t.includes("trabajo")) use_case = "WORK";
  if (t.includes("estudio")) use_case = "STUDY";

  if (t.includes("laptop")) product_interest = "LAPTOP";
  if (t.includes("impresora")) product_interest = "PRINTER";

  if (t.includes("no imprime") || t.includes("error")) {
    problem = text;
  }

  const match = t.match(/(\d{5,7})/);
  if (match) budget = match[1];

  return {
    budget,
    use_case,
    problem,
    product_interest,
  };
}

/*
====================================================
STAGE DETECTION (🔥 MEJORADO REAL)
====================================================
*/

function detectStage({ lead = {}, known_data, history = [] }) {
  // prioridad: score
  if (lead?.score >= 85) return "HOT";

  // problema detectado → diagnóstico
  if (known_data.problem) return "QUALIFYING";

  // info suficiente para recomendar
  if (
    known_data.product_interest &&
    known_data.use_case &&
    known_data.budget
  ) {
    return "MID";
  }

  // interés pero falta info
  if (known_data.product_interest) {
    return "QUALIFYING";
  }

  // fallback
  return "EARLY";
}

/*
====================================================
PERSONA BUILDER
====================================================
*/

function buildPersona(config = {}) {
  return {
    name:
      config?.agent_name ||
      config?.assistant_name ||
      "Asistente",

    tone: config?.tone || "neutral_professional",

    emoji_policy: config?.emoji_policy || "max_1",

    communication_style:
      config?.communication_style || "concise",

    restrictions: [
      ...(config?.restrictions || []),
      "no_technical_explanations",
      "no_information_dump",
      "must_close_conversation",
    ],

    closing_style: config?.closing_style || "soft_close",
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
    /*
    ========================================
    CORE DATA
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
    HISTORY (MEJORADO)
    ========================================
    */

    let history = [];

    if (phone) {
      const conversation = (
        await pool.query(
          `
          SELECT id
          FROM conversations
          WHERE organization_id = $1
          AND external_user_id = $2
          ORDER BY updated_at DESC
          LIMIT 1
          `,
          [organization_id, phone]
        )
      ).rows[0];

      if (conversation?.id) {
        const rows = (
          await pool.query(
            `
            SELECT role, content, created_at
            FROM messages
            WHERE organization_id = $1
            AND conversation_id = $2
            ORDER BY created_at DESC
            LIMIT 12
            `,
            [organization_id, conversation.id]
          )
        ).rows || [];

        history = rows.reverse().map((m) => ({
          role: m.role,
          content: m.content,
        }));
      }
    }

    /*
    ========================================
    DATA
    ========================================
    */

    const detected = detectKnownData(text);
    const known_data = mergeKnownData(detected, lead);

    /*
    ========================================
    STAGE
    ========================================
    */

    const stage = detectStage({
      lead,
      known_data,
      history,
    });

    /*
    ========================================
    STRATEGY INPUTS (MEJORADO)
    ========================================
    */

    const strategy_inputs = {
      has_problem: !!known_data.problem,
      has_budget: !!known_data.budget,
      has_product_interest: !!known_data.product_interest,

      has_enough_info:
        known_data.product_interest &&
        (known_data.use_case || known_data.problem),

      needs_qualification:
        !known_data.use_case || !known_data.product_interest,

      can_close:
        known_data.product_interest &&
        known_data.budget &&
        stage === "MID",

      interaction_depth: history.length,

      repeat_user: history.length > 3,

      readiness_level:
        lead?.score >= 80
          ? "HIGH"
          : lead?.score >= 40
          ? "MEDIUM"
          : "LOW",
    };

    /*
    ========================================
    OUTPUT
    ========================================
    */

    return {
      organization: {
        id: organization_id,
        business_name: business?.business_name || "el negocio",
      },

      assistant: {
        name:
          config?.agent_name ||
          config?.assistant_name ||
          "Asistente",
      },

      persona: buildPersona(config),

      intent: detectIntent(text),

      stage,

      known_data,

      strategy_inputs,

      user_message: safe(text),

      sales_context: {
        interest_level: lead?.interest_level || "LOW",
        lead_score: lead?.score || 0,
      },

      history,

      business_context: {
        name: business?.business_name || null,
        location: business?.location || null,
        payments: {
          sinpe: business?.sinpe_number || null,
          iban: business?.iban || null,
        },
        delivery: {
          available: true,
        },
      },
    };

  } catch (err) {
    console.error("❌ CONTEXT ERROR", err);

    return {
      organization: { id: organization_id },
      assistant: { name: "Asistente" },
      intent: detectIntent(text),
      stage: "EARLY",
      known_data: {},
      strategy_inputs: {},
      user_message: text,
      history: [],
    };
  }
}

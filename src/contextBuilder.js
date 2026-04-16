/*
====================================================
EVA CORE — CONTEXT BUILDER (INTELLIGENCE vNEXT FIXED)
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
DETECTION (LIGHT — NO DUPLICAR ENGINES)
====================================================
*/

function detectKnownData(text = "", lead = {}) {
  const t = lower(text);

  let use_case = lead?.use_case || null;
  let product_interest = lead?.product_interest || null;
  let problem = lead?.problem || null;
  let budget = lead?.budget || null;

  // SOLO detección ligera (NO duplicar engines complejos)
  if (!use_case) {
    if (t.includes("trabajo")) use_case = "WORK";
    if (t.includes("estudio")) use_case = "STUDY";
  }

  if (!product_interest) {
    if (t.includes("laptop")) product_interest = "LAPTOP";
    if (t.includes("impresora")) product_interest = "PRINTER";
  }

  if (!problem) {
    if (t.includes("no imprime") || t.includes("error")) {
      problem = text;
    }
  }

  if (!budget) {
    const match = t.match(/(\d{5,7})/);
    if (match) budget = match[1];
  }

  return {
    budget,
    use_case,
    problem,
    product_interest,
  };
}

/*
====================================================
STAGE DETECTION (🔥 NUEVO REAL)
====================================================
*/

function detectStage({ lead = {}, history = [], known_data }) {
  if (lead?.stage && lead.stage !== "EARLY") return lead.stage;

  if (known_data.problem) return "QUALIFYING";

  if (known_data.product_interest && known_data.use_case && !known_data.budget) {
    return "QUALIFYING";
  }

  if (known_data.product_interest && known_data.budget) {
    return "MID";
  }

  if (lead?.score >= 80) return "HOT";

  return "EARLY";
}

/*
====================================================
PERSONA BUILDER
====================================================
*/

function buildPersona(config = {}, business = {}) {
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
    HISTORY
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
            SELECT role, content
            FROM messages
            WHERE organization_id = $1
            AND conversation_id = $2
            ORDER BY created_at DESC
            LIMIT 10
            `,
            [organization_id, conversation.id]
          )
        ).rows || [];

        history = rows.reverse();
      }
    }

    /*
    ========================================
    DATA MERGE (🔥 MEJORADO)
    ========================================
    */

    const known_data = detectKnownData(text, lead);

    /*
    ========================================
    STAGE
    ========================================
    */

    const stage = detectStage({
      lead,
      history,
      known_data,
    });

    /*
    ========================================
    STRATEGY INPUTS (🔥 PRO)
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

      persona: buildPersona(config, business),

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
        payments: {
          sinpe: business?.sinpe_number || null,
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

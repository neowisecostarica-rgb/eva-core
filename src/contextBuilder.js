/*
====================================================
EVA CORE — CONTEXT BUILDER (INTELLIGENCE vNEXT FIXED v3)
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

function truthyString(value) {
  const v = lower(value);
  return v === "true" || v === "1" || v === "si" || v === "sí" || v === "yes";
}

/*
====================================================
MERGE MEMORY
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

  if (t.includes("laptop") || t.includes("computadora") || t.includes("pc")) {
    product_interest = "LAPTOP";
  }

  if (t.includes("impresora")) {
    product_interest = "PRINTER";
  }

  if (t.includes("monitor")) {
    product_interest = "MONITOR";
  }

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
    problem = safe(text);
  }

  const currencyMatch = safe(text).match(/₡\s*([\d.,]+)/i);
  if (currencyMatch?.[1]) {
    const value = Number(currencyMatch[1].replace(/[.,]/g, ""));
    budget = Number.isNaN(value) ? null : value;
  }

  if (!budget) {
    const milMatch = safe(text).match(/(\d{2,3})\s*mil\b/i);
    if (milMatch?.[1]) {
      const value = Number(milMatch[1]) * 1000;
      budget = Number.isNaN(value) ? null : value;
    }
  }

  if (!budget) {
    const numeric = t.match(/(\d{5,7})/);
    if (numeric?.[1]) {
      const value = Number(numeric[1]);
      budget = Number.isNaN(value) ? null : value;
    }
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
STAGE DETECTION
====================================================
*/

function detectStage({ lead = {}, known_data }) {
  if (lead?.score >= 85) return "HOT";

  if (known_data.problem) return "QUALIFYING";

  if (
    known_data.product_interest &&
    known_data.use_case &&
    known_data.budget
  ) {
    return "MID";
  }

  if (known_data.product_interest) {
    return "QUALIFYING";
  }

  return "EARLY";
}

/*
====================================================
PERSONA BUILDER
====================================================
*/

function buildPersona(config = {}) {
  const dynamicRestrictions = [];

  if (config?.allow_technical_explanations === false) {
    dynamicRestrictions.push("no_technical_explanations");
  }

  if (config?.allow_information_dump === false) {
    dynamicRestrictions.push("no_information_dump");
  }

  if (config?.must_close_conversation === true) {
    dynamicRestrictions.push("must_close_conversation");
  }

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
      ...dynamicRestrictions,
      "no_technical_explanations",
      "no_information_dump",
      "must_close_conversation",
    ],

    closing_style: config?.closing_style || "soft_close",
  };
}

/*
====================================================
BUSINESS RULES BUILDER
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
      "ask_for_confirmation_if_missing_data",
      "do_not_repeat_answered_questions",
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
CONSTRAINTS BUILDER
====================================================
*/

function buildConstraints(config = {}, business = {}) {
  const deliveryConfigured =
    business?.delivery_available === true ||
    truthyString(business?.delivery_available);

  return {
    max_lines_early: 4,
    max_lines_default: 5,
    max_emojis: 1,
    no_invent_information: true,
    ask_if_missing_data: true,
    do_not_repeat_answered_questions: true,
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
    STRATEGY INPUTS
    ========================================
    */

    const strategy_inputs = {
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
        !!known_data.budget &&
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

    const business_rules = buildBusinessRules(config, business);
    const constraints = buildConstraints(config, business);

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

      business_rules,

      constraints,

      business_context: {
        name: business?.business_name || null,
        location: business?.location || null,
        payments: {
          sinpe: business?.sinpe_number || null,
          iban: business?.iban || null,
        },
        delivery: {
          available: constraints.delivery_available,
        },
      },
    };
  } catch (err) {
    console.error("❌ CONTEXT ERROR", err);

    return {
      organization: { id: organization_id },
      assistant: { name: "Asistente" },
      persona: {
        name: "Asistente",
        tone: "neutral_professional",
        emoji_policy: "max_1",
        communication_style: "concise",
        restrictions: [
          "no_technical_explanations",
          "no_information_dump",
          "must_close_conversation",
        ],
        closing_style: "soft_close",
      },
      intent: detectIntent(text),
      stage: "EARLY",
      known_data: {},
      strategy_inputs: {},
      sales_context: {
        interest_level: "LOW",
        lead_score: 0,
      },
      history: [],
      business_rules: {
        tone: "profesional cercano",
        emoji_policy: "max_1",
        communication_style: "concise",
        closing_style: "soft_close",
        instructions: "",
        restrictions: [
          "no_invent_information",
          "use_only_business_data",
          "ask_for_confirmation_if_missing_data",
          "do_not_repeat_answered_questions",
          "must_close_or_ask",
          "max_1_emoji",
          "no_information_dump",
          "no_technical_explanations",
        ],
      },
      constraints: {
        max_lines_early: 4,
        max_lines_default: 5,
        max_emojis: 1,
        no_invent_information: true,
        ask_if_missing_data: true,
        do_not_repeat_answered_questions: true,
        must_close_or_ask: true,
        no_technical_explanations: true,
        no_information_dump: true,
        payments_available: {
          sinpe: false,
          iban: false,
        },
        delivery_available: false,
        tone: "profesional cercano",
      },
      user_message: safe(text),
      business_context: {
        name: null,
        location: null,
        payments: {
          sinpe: null,
          iban: null,
        },
        delivery: {
          available: false,
        },
      },
    };
  }
}

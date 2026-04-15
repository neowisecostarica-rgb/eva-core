/*
====================================================
EVA CORE — CONTEXT BUILDER (PERSONA + STRATEGY READY)
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
DETECTION
====================================================
*/

function detectKnownData(text = "") {
  const t = lower(text);

  let use_case = null;
  let product_interest = null;
  let problem = null;
  let budget = null;

  if (
    t.includes("teletrabajo") ||
    t.includes("oficina") ||
    t.includes("office") ||
    t.includes("trabajo")
  ) {
    use_case = "WORK";
  } else if (
    t.includes("estudio") ||
    t.includes("colegio") ||
    t.includes("universidad") ||
    t.includes("clases")
  ) {
    use_case = "STUDY";
  }

  if (
    t.includes("laptop") ||
    t.includes("computadora") ||
    t.includes("compu")
  ) {
    product_interest = "LAPTOP";
  } else if (t.includes("impresora")) {
    product_interest = "PRINTER";
  } else if (t.includes("monitor")) {
    product_interest = "MONITOR";
  }

  if (
    t.includes("no imprime") ||
    t.includes("no enciende") ||
    t.includes("error") ||
    t.includes("falla") ||
    t.includes("malo") ||
    t.includes("dañado")
  ) {
    problem = text;
  }

  const budgetMatch = t.match(/(\d{2,3}(?:[.,]\d{3})+|\d{5,7})/);
  if (budgetMatch) {
    budget = budgetMatch[1].replace(/[.,]/g, "");
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
SETUP VALIDATION
====================================================
*/

function getMissingSetupFields(business = {}) {
  const missing = [];

  if (!business?.business_name) {
    missing.push("nombre del negocio");
  }

  if (!business?.sinpe_number && !business?.bank_name) {
    missing.push("métodos de pago");
  }

  if (
    business?.delivery_available === null ||
    business?.delivery_available === undefined
  ) {
    missing.push("configuración de envíos");
  }

  return missing;
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
    let lastMessageTime = null;

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
        const historyRows = (
          await pool.query(
            `
            SELECT role, content, created_at
            FROM messages
            WHERE organization_id = $1
            AND conversation_id = $2
            ORDER BY created_at DESC
            LIMIT 10
            `,
            [organization_id, conversation.id]
          )
        ).rows || [];

        if (historyRows.length > 0) {
          lastMessageTime = historyRows[0].created_at;
        }

        history = historyRows
          .reverse()
          .map((m) => ({
            role: m.role,
            content: m.content,
          }));
      }
    }

    /*
    ========================================
    TIME LOGIC
    ========================================
    */

    let hours_since_last_message = null;
    let is_reentry = false;

    if (lastMessageTime) {
      const diff =
        (Date.now() - new Date(lastMessageTime).getTime()) /
        (1000 * 60 * 60);

      hours_since_last_message = diff;

      if (diff > 2) {
        is_reentry = true;
      }
    }

    let conversation_type = "new";

    if (history.length > 0 && !is_reentry) {
      conversation_type = "active";
    }

    if (is_reentry) {
      conversation_type = "reentry";
    }

    /*
    ========================================
    DATA MERGE
    ========================================
    */

    const detected = detectKnownData(text);

    const known_data = {
      budget: detected.budget || lead?.budget || null,
      use_case: detected.use_case || lead?.use_case || null,
      product_interest:
        detected.product_interest || lead?.product_interest || null,
      problem: detected.problem || lead?.problem || null,
    };

    /*
    ========================================
    PERSONA
    ========================================
    */

    const persona = buildPersona(config, business);

    /*
    ========================================
    BUSINESS CONTEXT
    ========================================
    */

    const business_context = {
      name: business?.business_name || null,
      type: business?.business_type || null,
      phone: business?.phone || null,

      payments: {
        sinpe: business?.sinpe_number || null,
        bank_name: business?.bank_name ?? null,
      },

      operations: {
        delivery: business?.delivery_available ?? null,
      },
    };

    /*
    ========================================
    SETUP STATUS
    ========================================
    */

    const missing_setup_fields = getMissingSetupFields(business);
    const is_ready = missing_setup_fields.length === 0;

    /*
    ====================================================
    STRATEGY INPUTS (NEW — CORE INTELLIGENCE)
    ====================================================
    */

    const strategy_inputs = {
      has_problem: !!known_data.problem,
      has_budget: !!known_data.budget,
      has_product_interest: !!known_data.product_interest,

      readiness_level:
        lead?.score >= 80
          ? "HIGH"
          : lead?.score >= 40
          ? "MEDIUM"
          : "LOW",

      conversation_goal:
        config?.objective || "SELL",

      is_service_flow: !!known_data.problem,
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

      persona,

      intent: detectIntent(text),

      stage: lead?.stage || "EARLY",

      known_data,

      strategy_inputs, // 🔥 NUEVO

      user_message: safe(text),

      sales_context: {
        interest_level: lead?.interest_level || "LOW",
        lead_score: lead?.score || 0,
      },

      history,

      business_context,

      meta: {
        conversation_type,
        is_reentry,
        hours_since_last_message,
        is_ready,
        missing_setup_fields,
      },
    };

  } catch (err) {
    console.error("❌ CONTEXT ERROR", err);

    return {
      organization: { id: organization_id, business_name: "el negocio" },
      assistant: { name: "Asistente" },
      persona: {},
      intent: detectIntent(text),
      stage: "EARLY",
      known_data: {
        budget: null,
        use_case: null,
        product_interest: null,
        problem: null,
      },
      strategy_inputs: {}, // 🔥 fallback seguro
      user_message: safe(text),
      sales_context: {
        interest_level: "LOW",
        lead_score: 0,
      },
      history: [],
      business_context: {},
      meta: {
        conversation_type: "new",
        is_reentry: false,
        hours_since_last_message: null,
        is_ready: false,
        missing_setup_fields: ["configuración base del negocio"],
      },
    };
  }
}

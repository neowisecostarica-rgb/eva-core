/*
====================================================
EVA CORE — CONTEXT BUILDER (BLOCK 2.1 — ENFORCED)
====================================================
*/

import pool from "./db.js";

/*
====================================================
UTILS
====================================================
*/

function safeString(v) {
  return String(v || "").trim();
}

function normalizeIntent(intent) {
  const value = safeString(intent).toUpperCase();

  const allowed = [
    "BUY",
    "INFO",
    "SERVICE",
    "GREETING",
    "FOLLOWUP",
    "OTHER",
  ];

  return allowed.includes(value) ? value : "OTHER";
}

function normalizeStage(stage) {
  const value = safeString(stage).toUpperCase();

  const allowed = ["EARLY", "QUALIFYING", "MID", "HOT", "POST"];

  return allowed.includes(value) ? value : "EARLY";
}

function mergeKnownData(dbData = {}, detectedData = {}) {
  return {
    budget: detectedData.budget ?? dbData.budget ?? null,
    use_case: detectedData.use_case ?? dbData.use_case ?? null,
    product_interest:
      detectedData.product_interest ?? dbData.product_interest ?? null,
    problem: detectedData.problem ?? dbData.problem ?? null,
  };
}

function resolveStage({ lead, detectedStage }) {
  // PRIORIDAD: DB
  if (lead?.stage) {
    return normalizeStage(lead.stage);
  }

  // FALLBACK
  return normalizeStage(detectedStage || "EARLY");
}

function buildBusinessRules(config = {}) {
  return {
    no_technical_explanations:
      config?.no_technical_explanations ?? true,

    max_emojis: Number(config?.max_emojis ?? 1) || 1,

    close_always: config?.close_always ?? true,

    ask_before_explain: config?.ask_before_explain ?? true,
  };
}

function buildSignals({ stage, known_data = {}, lead = {} }) {
  const normalizedStage = normalizeStage(stage);

  return {
    is_hot: normalizedStage === "HOT",
    is_mid: normalizedStage === "MID",
    is_qualifying: normalizedStage === "QUALIFYING",
    is_early: normalizedStage === "EARLY",
    is_post: normalizedStage === "POST",

    has_budget: !!known_data?.budget,
    has_use_case: !!known_data?.use_case,
    has_problem: !!known_data?.problem,
    has_product_interest: !!known_data?.product_interest,

    is_returning_customer: !!lead?.id,
  };
}

function ensureContextContract(context = {}) {
  return {
    organization: {
      id: safeString(context?.organization?.id),
      business_name:
        safeString(context?.organization?.business_name) || "el negocio",
      business_type:
        safeString(context?.organization?.business_type) || "general",
    },

    assistant: {
      name: safeString(context?.assistant?.name) || "Asistente",
      tone: safeString(context?.assistant?.tone) || "profesional",
      objective: safeString(context?.assistant?.objective) || "vender",
    },

    lead: context?.lead || {},
    conversation: {
      id: context?.conversation?.id || null,
      last_message: context?.conversation?.last_message || null,
    },

    intent: normalizeIntent(context?.intent),
    stage: normalizeStage(context?.stage),
    known_data: {
      budget: context?.known_data?.budget ?? null,
      use_case: context?.known_data?.use_case ?? null,
      product_interest: context?.known_data?.product_interest ?? null,
      problem: context?.known_data?.problem ?? null,
    },

    business_rules: {
      no_technical_explanations:
        context?.business_rules?.no_technical_explanations ?? true,
      max_emojis: Number(context?.business_rules?.max_emojis ?? 1) || 1,
      close_always: context?.business_rules?.close_always ?? true,
      ask_before_explain: context?.business_rules?.ask_before_explain ?? true,
    },

    history: Array.isArray(context?.history) ? context.history : [],

    sales_context: {
      is_returning_customer:
        context?.sales_context?.is_returning_customer ?? false,
      interest_level: safeString(context?.sales_context?.interest_level) || "LOW",
      last_stage: safeString(context?.sales_context?.last_stage) || "NEW",
      has_budget: context?.sales_context?.has_budget ?? false,
      has_use_case: context?.sales_context?.has_use_case ?? false,
      has_problem: context?.sales_context?.has_problem ?? false,
      has_product_interest:
        context?.sales_context?.has_product_interest ?? false,
    },

    signals: {
      ...(context?.signals || {}),
    },

    user_message: safeString(context?.user_message),
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
  known_data = {},
}) {
  try {
    /*
    ========================================
    BUSINESS PROFILE
    ========================================
    */

    const businessRes = await pool.query(
      `SELECT * FROM business_profile WHERE organization_id = $1 LIMIT 1`,
      [organization_id]
    );

    const business = businessRes.rows[0] || {};

    /*
    ========================================
    PROMPT CONFIG
    ========================================
    */

    const configRes = await pool.query(
      `SELECT * FROM prompt_config WHERE organization_id = $1 LIMIT 1`,
      [organization_id]
    );

    const config = configRes.rows[0] || {};

    /*
    ========================================
    LEAD (CRÍTICO)
    ========================================
    */

    let lead = {};

    if (phone) {
      const leadRes = await pool.query(
        `SELECT * FROM leads WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
        [organization_id, phone]
      );

      lead = leadRes.rows[0] || {};
    }

    /*
    ========================================
    CONVERSATION
    ========================================
    */

    let conversation = {};

    if (phone) {
      const convRes = await pool.query(
        `
        SELECT *
        FROM conversations
        WHERE organization_id = $1
        AND external_user_id = $2
        ORDER BY updated_at DESC
        LIMIT 1
        `,
        [organization_id, phone]
      );

      conversation = convRes.rows[0] || {};
    }

    /*
    ========================================
    HISTORY
    ========================================
    */

    let history = [];

    if (conversation?.id) {
      const historyRes = await pool.query(
        `
        SELECT role, content
        FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at DESC
        LIMIT 10
        `,
        [conversation.id]
      );

      history = (historyRes.rows || []).reverse();
    }

    /*
    ========================================
    KNOWN DATA (MERGE DB + DETECTED)
    ========================================
    */

    const mergedKnownData = mergeKnownData(lead, known_data);

    /*
    ========================================
    STAGE REAL
    ========================================
    */

    const finalStage = resolveStage({
      lead,
      detectedStage: stage,
    });

    /*
    ========================================
    BUSINESS RULES
    ========================================
    */

    const business_rules = buildBusinessRules(config);

    /*
    ========================================
    SIGNALS
    ========================================
    */

    const signals = buildSignals({
      stage: finalStage,
      known_data: mergedKnownData,
      lead,
    });

    /*
    ========================================
    SALES CONTEXT
    ========================================
    */

    const sales_context = {
      is_returning_customer: !!lead?.id,
      interest_level: safeString(lead?.interest_level) || "LOW",
      last_stage: safeString(lead?.stage) || "NEW",
      has_budget: signals.has_budget,
      has_use_case: signals.has_use_case,
      has_problem: signals.has_problem,
      has_product_interest: signals.has_product_interest,
    };

    /*
    ========================================
    FINAL CONTEXT
    ========================================
    */

    const finalContext = {
      organization: {
        id: organization_id,
        business_name: business?.business_name || "el negocio",
        business_type: business?.business_type || "general",
      },

      assistant: {
        name: config?.assistant_name || config?.agent_name || "Asistente",
        tone: config?.tone || "profesional",
        objective: config?.objective || "vender",
      },

      lead,

      conversation: {
        id: conversation?.id || null,
        last_message: conversation?.last_message || null,
      },

      intent: normalizeIntent(intent),
      stage: finalStage,
      known_data: mergedKnownData,

      business_rules,
      history,
      sales_context,
      signals,
      user_message: safeString(text),
    };

    return ensureContextContract(finalContext);
  } catch (error) {
    console.error("❌ CONTEXT BUILDER ERROR", error);

    return ensureContextContract({
      organization: {
        id: organization_id,
        business_name: "el negocio",
        business_type: "general",
      },
      assistant: {
        name: "Asistente",
        tone: "profesional",
        objective: "vender",
      },
      lead: {},
      conversation: {},
      intent: normalizeIntent(intent),
      stage: normalizeStage(stage || "EARLY"),
      known_data: mergeKnownData({}, known_data),
      business_rules: buildBusinessRules({}),
      history: [],
      sales_context: {
        is_returning_customer: false,
        interest_level: "LOW",
        last_stage: "NEW",
        has_budget: !!known_data?.budget,
        has_use_case: !!known_data?.use_case,
        has_problem: !!known_data?.problem,
        has_product_interest: !!known_data?.product_interest,
      },
      signals: buildSignals({
        stage: normalizeStage(stage || "EARLY"),
        known_data: mergeKnownData({}, known_data),
        lead: {},
      }),
      user_message: text,
    });
  }
}

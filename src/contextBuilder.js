/*
====================================================
EVA CORE — CONTEXT BUILDER (BLOCK 2 — FINAL FIX)
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

function mergeKnownData(dbData = {}, detectedData = {}) {
  return {
    budget: detectedData.budget ?? dbData.budget ?? null,
    use_case: detectedData.use_case ?? dbData.use_case ?? null,
    product_interest:
      detectedData.product_interest ?? dbData.product_interest ?? null,
    problem: detectedData.problem ?? null,
  };
}

function resolveStage({ lead, detectedStage }) {
  // 🔥 PRIORIDAD: DB
  if (lead?.stage) {
    return String(lead.stage).toUpperCase();
  }

  // 🔥 FALLBACK
  return String(detectedStage || "EARLY").toUpperCase();
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
    🔥 KNOWN DATA (MERGE DB + DETECTED)
    ========================================
    */

    const mergedKnownData = mergeKnownData(lead, known_data);

    /*
    ========================================
    🔥 STAGE REAL
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

    const business_rules = {
      no_technical_explanations:
        config?.no_technical_explanations ?? true,

      max_emojis: config?.max_emojis ?? 1,

      close_always: config?.close_always ?? true,

      ask_before_explain: config?.ask_before_explain ?? true,
    };

    /*
    ========================================
    SALES CONTEXT
    ========================================
    */

    const sales_context = {
      is_returning_customer: !!lead?.id,
      interest_level: lead?.interest_level || "LOW",
      last_stage: lead?.stage || "NEW",
    };

    /*
    ========================================
    FINAL CONTEXT
    ========================================
    */

    return {
      organization: {
        id: organization_id,
        business_name: business?.business_name || "el negocio",
        business_type: business?.business_type || "general",
      },

      assistant: {
        name:
          config?.assistant_name ||
          config?.agent_name ||
          "Asistente",

        tone: config?.tone || "profesional",

        objective: config?.objective || "vender",
      },

      lead,

      conversation: {
        id: conversation?.id || null,
        last_message: conversation?.last_message || null,
      },

      // 🔴 CORE REAL
      intent,
      stage: finalStage,
      known_data: mergedKnownData,

      business_rules,
      history,
      sales_context,
      user_message: safeString(text),
    };
  } catch (error) {
    console.error("❌ CONTEXT BUILDER ERROR", error);

    return {
      organization: {},
      assistant: {},
      lead: {},
      conversation: {},
      intent: null,
      stage: "EARLY",
      known_data: {},
      business_rules: {},
      history: [],
      sales_context: {},
      user_message: text,
    };
  }
}

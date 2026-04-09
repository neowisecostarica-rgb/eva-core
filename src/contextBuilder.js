/*
====================================================
EVA CORE — CONTEXT BUILDER (BLOCK 2 — REAL ENGINE)
====================================================
*/

import pool from "./db.js";

export async function buildContext({
  organization_id,
  phone,
  text = "",
  intent = null,
  stage = null,
  known_data = {},
}) {
  try {
    // ================================
    // BUSINESS PROFILE
    // ================================
    const businessRes = await pool.query(
      `SELECT * FROM business_profile WHERE organization_id = $1 LIMIT 1`,
      [organization_id]
    );

    const business = businessRes.rows[0] || {};

    // ================================
    // PROMPT CONFIG
    // ================================
    const configRes = await pool.query(
      `SELECT * FROM prompt_config WHERE organization_id = $1 LIMIT 1`,
      [organization_id]
    );

    const config = configRes.rows[0] || {};

    // ================================
    // LEAD
    // ================================
    let lead = {};
    if (phone) {
      const leadRes = await pool.query(
        `SELECT * FROM leads WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
        [organization_id, phone]
      );
      lead = leadRes.rows[0] || {};
    }

    // ================================
    // HISTORY (últimos mensajes)
    // ================================
    let history = [];
    if (lead?.id) {
      const historyRes = await pool.query(
        `
        SELECT role, content
        FROM messages
        WHERE organization_id = $1
        ORDER BY created_at DESC
        LIMIT 10
        `,
        [organization_id]
      );

      history = (historyRes.rows || []).reverse();
    }

    // ================================
    // BUSINESS RULES (BASE)
    // ================================
    const business_rules = {
      no_technical_explanations: true,
      max_emojis: 1,
      close_always: true,
      ask_before_explain: true,
    };

    // ================================
    // SALES CONTEXT (INTELIGENCIA)
    // ================================
    const sales_context = {
      is_returning_customer: !!lead?.id,
      interest_level: lead?.interest_level || "LOW",
      last_stage: lead?.stage || "EARLY",
    };

    // ================================
    // CONTEXT FINAL (SOT)
    // ================================
    return {
      organization: {
        business_name: business.business_name || "el negocio",
        business_type: business.business_type || "general",
      },

      assistant: {
        name: config.assistant_name || "Asistente",
        tone: config.tone || "profesional",
        objective: config.objective || "vender",
      },

      lead,

      // 🔴 NUEVO CORE
      intent,
      stage,
      known_data,

      business_rules,
      history,
      sales_context,
      user_message: text,
    };
  } catch (error) {
    console.error("❌ CONTEXT BUILDER ERROR", error);

    return {
      organization: {},
      assistant: {},
      lead: {},
      intent: null,
      stage: null,
      known_data: {},
      business_rules: {},
      history: [],
      sales_context: {},
      user_message: text,
    };
  }
}

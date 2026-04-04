/*
====================================================
EVA CORE — CONTEXT BUILDER (BLOCK 4.5 FIXED)
====================================================
*/

import pool from "./db.js";

export async function buildContext({ organization_id, phone }) {
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
    // LEAD (si existe)
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
    // CONTEXT FINAL
    // ================================
    return {
      organization: {
        business_name: business.business_name,
        business_type: business.business_type,
        phone: business.phone,
      },
      assistant: {
        name: config.assistant_name,
        tone: config.tone,
        objective: config.objective,
      },
      lead,
    };
  } catch (error) {
    console.error("❌ CONTEXT BUILDER ERROR", error);
    return {};
  }
}

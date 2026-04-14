/*
====================================================
EVA CORE — CONTEXT BUILDER (REENTRY AWARE vNext)
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

function hasAny(text, patterns = []) {
  return patterns.some((p) => lower(text).includes(p));
}

/*
====================================================
DETECTION
====================================================
*/

function detectKnownData(text) {
  return {
    budget: null,
    use_case: null,
    problem: null,
    product_interest: null,
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
    CORE
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
    HISTORY + TIME
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

    /*
    ========================================
    CONTEXT TYPE
    ========================================
    */

    let conversation_type = "new";

    if (history.length > 0 && !is_reentry) {
      conversation_type = "active";
    }

    if (is_reentry) {
      conversation_type = "reentry";
    }

    /*
    ========================================
    MERGE DATA
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
    OUTPUT
    ========================================
    */

    return {
      organization: {
        id: organization_id,
        business_name: business?.business_name || "el negocio",
      },

      assistant: {
        name: config?.assistant_name || "Asistente",
      },

      intent: detectIntent(text),

      stage: lead?.stage || "EARLY",

      known_data,

      user_message: safe(text),

      sales_context: {
        interest_level: lead?.interest_level || "LOW",
      },

      history,

      // 🔥 NUEVO
      meta: {
        conversation_type,
        is_reentry,
        hours_since_last_message,
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
      user_message: text,
      sales_context: {},
      history: [],
      meta: {
        conversation_type: "new",
        is_reentry: false,
        hours_since_last_message: null,
      },
    };
  }
}

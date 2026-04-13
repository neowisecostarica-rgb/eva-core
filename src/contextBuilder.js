/*
====================================================
EVA CORE — CONTEXT BUILDER (vNext — CLEAN CONTEXT ONLY)
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
DETECTION (TURN ONLY — NO DECISION)
====================================================
*/

function detectBudget(text) {
  const t = safe(text);

  const colon = t.match(/₡\s*([\d.,]+)/i);
  if (colon?.[1]) {
    const value = Number(colon[1].replace(/[.,]/g, ""));
    return Number.isNaN(value) ? null : value;
  }

  const mil = t.match(/(\d{2,3})\s*mil\b/i);
  if (mil?.[1]) {
    const value = Number(mil[1]) * 1000;
    return Number.isNaN(value) ? null : value;
  }

  const raw = t.match(/\b(\d{5,7})\b/);
  if (raw?.[1]) {
    const value = Number(raw[1]);
    return Number.isNaN(value) ? null : value;
  }

  return null;
}

function detectUseCase(text) {
  const t = lower(text);

  if (hasAny(t, ["estudio", "colegio", "universidad"])) return "STUDY";
  if (hasAny(t, ["trabajo", "oficina", "empresa"])) return "WORK";
  if (hasAny(t, ["diseño", "video", "render"])) return "CREATIVE";
  if (hasAny(t, ["gaming", "jugar"])) return "GAMING";

  return null;
}

function detectProblem(text) {
  if (
    hasAny(text, [
      "no imprime",
      "no enciende",
      "error",
      "atascada",
      "lenta",
      "reparar",
      "mantenimiento",
    ])
  ) {
    return safe(text);
  }

  return null;
}

function detectProductInterest(text) {
  const t = lower(text);

  if (hasAny(t, ["laptop", "computadora"])) return "LAPTOP";
  if (hasAny(t, ["impresora"])) return "PRINTER";
  if (hasAny(t, ["monitor"])) return "MONITOR";

  return null;
}

function detectKnownData(text) {
  return {
    budget: detectBudget(text),
    use_case: detectUseCase(text),
    problem: detectProblem(text),
    product_interest: detectProductInterest(text),
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
    🔥 HISTORY (FIX CRÍTICO)
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
          ORDER BY created_at DESC
          LIMIT 1
          `,
          [organization_id, phone]
        )
      ).rows[0];

      if (conversation?.id) {
        const historyRows = (
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
    DETECTION (TURN ONLY)
    ========================================
    */

    const current_entities = detectKnownData(text);

    /*
    ========================================
    OUTPUT (NO DECISION LOGIC)
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

      // ⚠️ SOLO DETECCIÓN BASE
      intent: detectIntent(text),
      stage: lead?.stage || "EARLY",
      known_data: {
        budget: lead?.budget || null,
        use_case: lead?.use_case || null,
        product_interest: lead?.product_interest || null,
        problem: lead?.problem || null,
      },

      current_entities, // 🔥 CLAVE PARA STRATEGY ENGINE

      user_message: safe(text),

      sales_context: {
        interest_level: lead?.interest_level || "LOW",
      },

      history,
      signals: {},
    };
  } catch (err) {
    console.error("❌ CONTEXT ERROR", err);

    return {
      organization: { id: organization_id },
      assistant: { name: "Asistente" },
      intent: detectIntent(text),
      stage: "EARLY",
      known_data: {},
      current_entities: detectKnownData(text),
      user_message: text,
      sales_context: {},
      history: [],
      signals: {},
    };
  }
}

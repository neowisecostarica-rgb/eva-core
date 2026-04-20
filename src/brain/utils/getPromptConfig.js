/*
====================================================
EVA CORE — PROMPT CONFIG LOADER (NORMALIZED vNEXT v2)
====================================================
*/

import pool from "../../db.js";

export async function getPromptConfig(organization_id) {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM prompt_config
      WHERE organization_id = $1
      LIMIT 1
      `,
      [organization_id]
    );

    if (result.rows.length === 0) {
      console.error("🚨 PROMPT_CONFIG MISSING", { organization_id });

      return {
        business_name: "NEGOCIO_NO_CONFIGURADO",
        agent_name: "Asistente",
        tone: "profesional cercano",
        instructions: "",
        emoji_policy: "max_1",
        communication_style: "concise",
        closing_style: "soft_close",
        __source: "fallback_missing_config",
      };
    }

    const config = result.rows[0];

    const normalized = {
      business_name: config.business_name || "este negocio",
      agent_name:
        config.agent_name || config.assistant_name || "Asistente",
      tone: config.tone || "profesional cercano",
      instructions: config.instructions || "",
      emoji_policy: config.emoji_policy || "max_1",
      communication_style: config.communication_style || "concise",
      closing_style: config.closing_style || "soft_close",
      __source: "database",
    };

    console.log("🧠 PROMPT_CONFIG_LOADED", {
      organization_id,
      source: normalized.__source,
      business_name: normalized.business_name,
      agent_name: normalized.agent_name,
    });

    return normalized;
  } catch (err) {
    console.error("❌ ERROR getPromptConfig:", {
      organization_id,
      error: err.message,
    });

    return {
      business_name: "ERROR_CONFIG",
      agent_name: "Asistente",
      tone: "profesional cercano",
      instructions: "",
      emoji_policy: "max_1",
      communication_style: "concise",
      closing_style: "soft_close",
      __source: "fallback_error",
    };
  }
}

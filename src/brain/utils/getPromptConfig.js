// src/brain/utils/getPromptConfig.js

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

    /*
    ========================================
    1. NO CONFIG FOUND → HARD WARNING
    ========================================
    */
    if (result.rows.length === 0) {
      console.error("🚨 PROMPT_CONFIG MISSING", { organization_id });

      return {
        business_name: "NEGOCIO_NO_CONFIGURADO",
        assistant_name: "Asistente",
        tone: "profesional cercano",
        objective: "ayudar al cliente",
        language: "es",
        __source: "fallback_missing_config"
      };
    }

    const config = result.rows[0];

    /*
    ========================================
    2. VALIDACIÓN DE CAMPOS CRÍTICOS
    ========================================
    */
    const normalized = {
      business_name: config.business_name || "este negocio",
      assistant_name: config.assistant_name || "Asistente",
      tone: config.tone || "profesional cercano",
      objective: config.objective || "ayudar al cliente",
      language: config.language || "es",
      __source: "database"
    };

    /*
    ========================================
    3. LOG CONTROLADO (DEBUG)
    ========================================
    */
    console.log("🧠 PROMPT_CONFIG_LOADED", {
      organization_id,
      source: normalized.__source,
      business_name: normalized.business_name
    });

    return normalized;

  } catch (err) {
    console.error("❌ ERROR getPromptConfig:", {
      organization_id,
      error: err.message
    });

    return {
      business_name: "ERROR_CONFIG",
      assistant_name: "Asistente",
      tone: "profesional cercano",
      objective: "ayudar al cliente",
      language: "es",
      __source: "fallback_error"
    };
  }
}

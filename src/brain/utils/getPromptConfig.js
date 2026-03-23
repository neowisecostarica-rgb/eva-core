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

    if (result.rows.length === 0) {
      console.warn("⚠️ No prompt_config, usando fallback");

      return {
        business_name: "este negocio",
        assistant_name: "Asistente",
        tone: "profesional cercano",
        objective: "ayudar al cliente",
        language: "es",
      };
    }

    return result.rows[0];

  } catch (err) {
    console.error("❌ ERROR getPromptConfig:", err);

    return {
      business_name: "este negocio",
      assistant_name: "Asistente",
      tone: "profesional cercano",
      objective: "ayudar al cliente",
      language: "es",
    };
  }
}

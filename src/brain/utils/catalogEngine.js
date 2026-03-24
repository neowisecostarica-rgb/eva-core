// src/brain/utils/catalogEngine.js

import pool from "../../db.js";

export async function searchCatalogSmart({ organization_id, query }) {
  try {
    if (!query) return [];

    /*
    ========================================
    1. NORMALIZAR QUERY
    ========================================
    */

    const words = query
      .toLowerCase()
      .replace(/[^\w\s]/gi, "")
      .split(" ")
      .filter(w => w.length > 2); // evitar ruido tipo "de", "la"

    if (words.length === 0) return [];

    console.log("🔍 Query:", query);
    console.log("🔍 Keywords:", words);

    /*
    ========================================
    2. BUILD CONDITIONS DINÁMICAS
    ========================================
    */

    const conditions = words.map((_, i) => `
      (
        LOWER(name) LIKE $${i + 2}
        OR LOWER(description) LIKE $${i + 2}
        OR LOWER(category) LIKE $${i + 2}
      )
    `);

    const values = [
      organization_id,
      ...words.map(w => `%${w}%`)
    ];

    /*
    ========================================
    3. SCORE BÁSICO (COUNT MATCHES)
    ========================================
    */

    const scoreCases = words.map((_, i) => `
      CASE
        WHEN LOWER(name) LIKE $${i + 2}
          OR LOWER(description) LIKE $${i + 2}
          OR LOWER(category) LIKE $${i + 2}
        THEN 1 ELSE 0
      END
    `);

    const scoreExpression = scoreCases.join(" + ");

    /*
    ========================================
    4. QUERY FINAL
    ========================================
    */

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        description,
        price,
        category,
        (${scoreExpression}) AS relevance_score
      FROM product_catalog
      WHERE organization_id = $1
      AND is_active = true
      AND (
        ${conditions.join(" OR ")}
      )
      ORDER BY relevance_score DESC
      LIMIT 5
      `,
      values
    );

    /*
    ========================================
    5. FALLBACK (si no encuentra nada)
    ========================================
    */

    if (result.rows.length === 0) {
      console.log("⚠️ No results, fallback simple");

      const fallback = await pool.query(
        `
        SELECT id, name, description, price, category
        FROM product_catalog
        WHERE organization_id = $1
        AND is_active = true
        LIMIT 5
        `,
        [organization_id]
      );

      return fallback.rows;
    }

    return result.rows;

  } catch (err) {
    console.error("❌ Catalog search error:", err);
    return [];
  }
}

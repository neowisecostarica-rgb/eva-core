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

    const normalized = query
      .toLowerCase()
      .replace(/[^\w\s]/gi, "");

    const words = normalized
      .split(" ")
      .filter(w => w.length > 2);

    if (words.length === 0) return [];

    console.log("🔍 Query:", query);
    console.log("🔍 Keywords:", words);

    /*
    ========================================
    2. DETECTAR CONTEXTO (USO REAL)
    ========================================
    */

    let intentCategory = null;

    if (
      normalized.includes("trabajo") ||
      normalized.includes("oficina") ||
      normalized.includes("empresa")
    ) {
      intentCategory = "trabajo";
    }

    if (
      normalized.includes("estudio") ||
      normalized.includes("colegio") ||
      normalized.includes("universidad")
    ) {
      intentCategory = "estudio";
    }

    if (
      normalized.includes("gaming") ||
      normalized.includes("juegos")
    ) {
      intentCategory = "gaming";
    }

    console.log("🧠 Intent Category:", intentCategory);

    /*
    ========================================
    3. BUILD CONDITIONS DINÁMICAS
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
    4. BOOST COMERCIAL (CLAVE)
    ========================================
    */

    let boostCase = "0";

    if (intentCategory === "trabajo") {
      boostCase = `
        CASE
          WHEN LOWER(category) LIKE '%corporativa%' THEN 3
          WHEN LOWER(name) LIKE '%thinkpad%' THEN 3
          WHEN LOWER(name) LIKE '%latitude%' THEN 3
          ELSE 0
        END
      `;
    }

    if (intentCategory === "estudio") {
      boostCase = `
        CASE
          WHEN LOWER(name) LIKE '%11e%' THEN 3
          WHEN LOWER(category) LIKE '%basica%' THEN 2
          ELSE 0
        END
      `;
    }

    if (intentCategory === "gaming") {
      boostCase = `
        CASE
          WHEN LOWER(name) LIKE '%gaming%' THEN 3
          ELSE 0
        END
      `;
    }

    /*
    ========================================
    5. SCORE TOTAL
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
    6. QUERY FINAL
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
        (${scoreExpression}) + (${boostCase}) AS relevance_score
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
    7. FALLBACK INTELIGENTE
    ========================================
    */

    if (result.rows.length === 0) {
      console.log("⚠️ No results, fallback inteligente");

      let fallbackQuery = `
        SELECT id, name, description, price, category
        FROM product_catalog
        WHERE organization_id = $1
        AND is_active = true
      `;

      if (intentCategory === "trabajo") {
        fallbackQuery += `
          AND (
            LOWER(category) LIKE '%corporativa%'
            OR LOWER(name) LIKE '%thinkpad%'
            OR LOWER(name) LIKE '%latitude%'
          )
        `;
      }

      if (intentCategory === "estudio") {
        fallbackQuery += `
          AND (
            LOWER(name) LIKE '%11e%'
            OR LOWER(category) LIKE '%basica%'
          )
        `;
      }

      fallbackQuery += ` LIMIT 5`;

      const fallback = await pool.query(fallbackQuery, [organization_id]);

      return fallback.rows;
    }

    return result.rows;

  } catch (err) {
    console.error("❌ Catalog search error:", err);
    return [];
  }
}

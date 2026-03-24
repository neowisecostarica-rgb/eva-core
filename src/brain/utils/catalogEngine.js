// src/brain/utils/catalogEngine.js

import pool from "../../db.js";

function extractKeywords(query) {
  if (!query) return [];

  return query
    .toLowerCase()
    .replace(/[^\w\s]/gi, "")
    .split(" ")
    .filter(w => w.length > 2);
}

export async function searchCatalogSmart({ organization_id, query }) {
  try {
    if (!query) return [];

    /*
    ========================================
    1. KEYWORDS
    ========================================
    */

    const keywords = extractKeywords(query);

    console.log("🔍 Keywords:", keywords);

    /*
    ========================================
    2. BUILD QUERY DINÁMICA
    ========================================
    */

    const conditions = keywords.map((_, i) => `
      (
        LOWER(name) LIKE $${i + 2}
        OR LOWER(description) LIKE $${i + 2}
        OR LOWER(category) LIKE $${i + 2}
      )
    `);

    const values = [
      organization_id,
      ...keywords.map(k => `%${k}%`)
    ];

    let sql = `
      SELECT id, name, description, price, category
      FROM product_catalog
      WHERE organization_id = $1
      AND is_active = true
    `;

    if (conditions.length > 0) {
      sql += ` AND (${conditions.join(" OR ")})`;
    }

    sql += ` LIMIT 3`;

    /*
    ========================================
    3. EJECUTAR
    ========================================
    */

    const result = await pool.query(sql, values);

    console.log("📦 Catalog Results:", result.rows);

    if (result.rows.length > 0) {
      return result.rows;
    }

    /*
    ========================================
    4. FALLBACK (TOP PRODUCTOS)
    ========================================
    */

    const fallback = await pool.query(
      `
      SELECT id, name, description, price, category
      FROM product_catalog
      WHERE organization_id = $1
      AND is_active = true
      ORDER BY created_at DESC
      LIMIT 2
      `,
      [organization_id]
    );

    console.log("📦 Fallback Results:", fallback.rows);

    return fallback.rows;

  } catch (err) {
    console.error("❌ catalogEngine error:", err);
    return [];
  }
}

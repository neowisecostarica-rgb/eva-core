// src/brain/utils/catalogEngine.js

import { pool } from "../../db.js";

export async function searchCatalogSmart({ organization_id, query }) {
  try {
    if (!query) return [];

    /*
    ========================================
    1. NORMALIZAR QUERY
    ========================================
    */

    const words = query.toLowerCase().split(" ");
    const keyword = words[words.length - 1]; // última palabra
    const q = `%${keyword}%`;

    console.log("🔍 Query original:", query);
    console.log("🔍 Keyword usada:", keyword);

    /*
    ========================================
    2. BUSQUEDA PRINCIPAL
    ========================================
    */

    const result = await pool.query(
      `
      SELECT id, name, description, price, category
      FROM product_catalog
      WHERE organization_id = $1
      AND is_active = true
      AND (
        LOWER(name) LIKE $2
        OR LOWER(description) LIKE $2
        OR LOWER(category) LIKE $2
      )
      LIMIT 5
      `,
      [organization_id, q]
    );

    console.log("📦 Catalog Results:", result.rows);

    if (result.rows.length > 0) {
      return result.rows;
    }

    /*
    ========================================
    3. FALLBACK (SI NO HAY MATCH)
    ========================================
    */

    const fallback = await pool.query(
      `
      SELECT id, name, description, price, category
      FROM product_catalog
      WHERE organization_id = $1
      AND is_active = true
      ORDER BY created_at DESC
      LIMIT 3
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

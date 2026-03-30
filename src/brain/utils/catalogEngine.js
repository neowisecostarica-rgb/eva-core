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

    console.log("🔍 Query:", query);
    console.log("🔍 Keywords:", words);

    /*
    ========================================
    2. QUERY FLEXIBLE (FIX CRÍTICO)
    ========================================
    */

    // 🔥 CAMBIO: búsqueda más permisiva
    const searchTerm = `%${normalized}%`;

    /*
    ========================================
    3. QUERY PRINCIPAL (SIMPLIFICADA Y MÁS POTENTE)
    ========================================
    */

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        description,
        price,
        category
      FROM product_catalog
      WHERE organization_id = $1
      AND is_active = true
      AND (
        LOWER(name) LIKE $2
        OR LOWER(description) LIKE $2
        OR LOWER(category) LIKE $2
      )
      ORDER BY name ASC
      LIMIT 5
      `,
      [organization_id, searchTerm]
    );

    /*
    ========================================
    4. FALLBACK REAL (IMPORTANTE)
    ========================================
    */

    if (result.rows.length === 0) {
      console.log("⚠️ No results, fallback real");

      const fallback = await pool.query(
        `
        SELECT id, name, description, price, category
        FROM product_catalog
        WHERE organization_id = $1
        AND is_active = true
        ORDER BY created_at DESC
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

console.log("🔍 Query:", query);
console.log("📦 Catalog Results:", result.rows);

// src/brain/utils/catalogEngine.js

import { pool } from "../../db.js";

export async function searchCatalogSmart({ organization_id, query }) {
  try {
    if (!query) return [];

    const q = `%${query.toLowerCase()}%`;

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

    if (result.rows.length > 0) {
      return result.rows;
    }

    // 🔥 fallback inteligente (trae top productos)
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

    return fallback.rows;

  } catch (err) {
    console.error("❌ catalogEngine error:", err);
    return [];
  }
}

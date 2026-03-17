/*
====================================================
EVA CATALOG ENGINE (FIXED - ALIGNED WITH REAL DB)
====================================================
*/

import pool from "../../db.js";

export async function searchCatalog({ organization_id, text }) {

  if (!organization_id || !text) {
    return [];
  }

  try {

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        description,
        price_crc,
        image_urls
      FROM product_catalog
      WHERE organization_id = $1
      AND is_active = true
      AND (
        name ILIKE '%' || $2 || '%'
        OR description ILIKE '%' || $2 || '%'
        OR category ILIKE '%' || $2 || '%'
      )
      ORDER BY name ASC
      LIMIT 5
      `,
      [organization_id, text]
    );

    return result.rows || [];

  } catch (err) {

    console.error("catalog search error", err.message);

    // 🔥 IMPORTANTE: NO romper flujo
    return [];

  }

}

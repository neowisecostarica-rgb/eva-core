/*
====================================================
EVA CATALOG ENGINE
Búsqueda de productos (FINAL FIX REAL DB)
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
        images
      FROM product_catalog
      WHERE organization_id = $1
      AND active = true
      AND deleted = false
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
    return [];

  }

}

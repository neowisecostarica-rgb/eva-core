/*
====================================================
EVA CATALOG ENGINE
Búsqueda de productos (optimizada y segura)
====================================================
*/

import pool from "../../db.js";

export async function searchCatalog({ organization_id, text }) {

  // Validación básica
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
        price,
        image_url
      FROM product_catalog
      WHERE organization_id = $1
      AND (
        name ILIKE '%' || $2 || '%'
        OR description ILIKE '%' || $2 || '%'
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

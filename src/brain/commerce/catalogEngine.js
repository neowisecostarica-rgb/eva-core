/*
====================================================
EVA CATALOG ENGINE
Búsqueda básica de productos
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
      SELECT *
      FROM product_catalog
      WHERE organization_id = $1
      AND (
        name ILIKE '%' || $2 || '%'
        OR description ILIKE '%' || $2 || '%'
        OR brand ILIKE '%' || $2 || '%'
      )
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

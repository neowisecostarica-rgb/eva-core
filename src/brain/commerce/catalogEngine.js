/*
====================================================
EVA CATALOG ENGINE (FIXED VERSION)
====================================================
*/

import pool from "../../db.js";

/*
====================================================
SEARCH CATALOG
====================================================
*/

export async function searchCatalog({ organization_id, text = "" }) {

  try {

    const query = `
      SELECT
        id,
        name,
        price_crc,
        description,
        images_url
      FROM product_catalog
      WHERE organization_id = $1
      AND (
        name ILIKE $2
        OR description ILIKE $2
      )
      LIMIT 5
    `;

    const values = [
      organization_id,
      `%${text}%`
    ];

    const result = await pool.query(query, values);

    console.log("📦 RAW DB RESULT:", result.rows);

    return result.rows;

  } catch (err) {
    console.error("❌ CATALOG SEARCH ERROR:", err);
    return [];
  }
}

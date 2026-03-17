/*
====================================================
EVA CATALOG ENGINE (SMART SEARCH VERSION)
====================================================
*/

import pool from "../../db.js";

/*
====================================================
TEXT NORMALIZATION
====================================================
*/

function normalizeSearchText(text = "") {
  const clean = text.toLowerCase();

  // sinónimos básicos (puedes expandir después)
  if (clean.includes("laptop") || clean.includes("computadora") || clean.includes("pc") || clean.includes("compu")) {
    return "laptop";
  }

  return clean;
}

/*
====================================================
MAIN SEARCH
====================================================
*/

export async function searchCatalog({ organization_id, text }) {

  if (!organization_id || !text) {
    return [];
  }

  try {

    const normalized = normalizeSearchText(text);

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
      ORDER BY featured DESC, name ASC
      LIMIT 5
      `,
      [organization_id, normalized]
    );

    return result.rows || [];

  } catch (err) {

    console.error("catalog search error", err.message);
    return [];

  }

}

/*
====================================================
EVA CATALOG ENGINE (FIX REAL + SMART SEARCH)
====================================================
*/

import pool from "../../db.js";

/*
====================================================
NORMALIZE TEXT
====================================================
*/

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/*
====================================================
EXTRACT SEARCH TERMS
====================================================
*/

function extractSearchTerms(text) {
  const normalized = normalizeText(text);

  /*
  ============================================
  INTENT MAPPING (CLAVE DEL ÉXITO)
  ============================================
  */

  if (
    normalized.includes("compu") ||
    normalized.includes("computadora") ||
    normalized.includes("pc") ||
    normalized.includes("laptop") ||
    normalized.includes("laptops") ||
    normalized.includes("equipo")
  ) {
    return [
      "thinkpad",
      "latitude",
      "lenovo",
      "dell"
    ];
  }

  /*
  ============================================
  FALLBACK NORMAL
  ============================================
  */

  const words = normalized
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 3);

  return words.slice(0, 5);
}

/*
====================================================
BUILD WHERE CLAUSE
====================================================
*/

function buildWhereClause(terms, startIndex = 2) {
  const conditions = [];
  const values = [];

  let paramIndex = startIndex;

  for (const term of terms) {
    conditions.push(`(
      LOWER(p.name) LIKE $${paramIndex}
      OR LOWER(p.category) LIKE $${paramIndex}
      OR LOWER(p.description) LIKE $${paramIndex}
    )`);

    values.push(`%${term}%`);
    paramIndex += 1;
  }

  return {
    clause: conditions.length > 0 ? conditions.join(" OR ") : "TRUE",
    values
  };
}

/*
====================================================
SEARCH CATALOG
====================================================
*/

export async function searchCatalog({ organization_id, text }) {

  if (!organization_id || !text) {
    return [];
  }

  try {

    const terms = extractSearchTerms(text);

    const { clause, values } = buildWhereClause(terms);

    const result = await pool.query(
      `
      SELECT
        p.id,
        p.name,
        p.category,
        p.description,
        p.price_crc,
        p.stock,
        p.image_urls
      FROM product_catalog p
      WHERE p.organization_id = $1
        AND p.is_active = true
        AND (${clause})
      ORDER BY p.updated_at DESC NULLS LAST
      LIMIT 3
      `,
      [organization_id, ...values]
    );

    return result.rows || [];

  } catch (err) {

    console.error("catalog search error", err.message);
    return [];

  }

}

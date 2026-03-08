import pool from "./db.js";

function normalizeText(value) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function extractSearchTerms(text) {
  const normalized = normalizeText(text);

  const dictionary = [
    "thinkpad",
    "lenovo",
    "dell",
    "latitude",
    "laptop",
    "computadora",
    "pc",
    "equipo",
    "estudio",
    "trabajo",
    "oficina",
    "universidad",
    "colegio",
    "escuela",
    "excel"
  ];

  const matchedTerms = dictionary.filter(term => normalized.includes(term));

  if (matchedTerms.length > 0) {
    return matchedTerms;
  }

  return normalized
    .split(/\s+/)
    .map(word => word.trim())
    .filter(word => word.length >= 3)
    .slice(0, 5);
}

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

export async function searchCatalog({ organization_id, text }) {
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
      p.is_active,
      p.updated_at,
      (
        SELECT pa.url
        FROM product_assets pa
        WHERE pa.product_id = p.id
        ORDER BY pa.sort_order ASC NULLS LAST, pa.created_at ASC
        LIMIT 1
      ) AS image
    FROM product_catalog p
    WHERE p.organization_id = $1
      AND p.is_active = true
      AND (${clause})
    ORDER BY
      CASE
        WHEN LOWER(p.name) LIKE '%thinkpad%' THEN 1
        WHEN LOWER(p.name) LIKE '%latitude%' THEN 2
        ELSE 3
      END,
      p.updated_at DESC NULLS LAST
    LIMIT 3
    `,
    [organization_id, ...values]
  );

  return result.rows;
}

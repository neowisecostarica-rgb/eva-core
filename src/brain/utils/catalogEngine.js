import pool from "../../db.js";

function normalizeQuery(query = "") {
  return String(query || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function searchCatalogSmart({ organization_id, query }) {
  try {
    if (!organization_id || !query) return [];

    const normalized = normalizeQuery(query);

    if (!normalized) return [];

    const words = normalized
      .split(" ")
      .filter((w) => w.length > 2)
      .slice(0, 6);

    console.log("🔍 Catalog query:", query);
    console.log("🔍 Catalog normalized:", normalized);
    console.log("🔍 Catalog keywords:", words);

    /*
    ========================================
    1. DIRECT/FLEX SEARCH
    ========================================
    */

    const directTerm = `%${normalized}%`;

    let result = await pool.query(
      `
      SELECT
        id,
        name,
        description,
        price,
        category,
        is_active,
        CASE
          WHEN LOWER(name) LIKE $2 THEN 100
          WHEN LOWER(category) LIKE $2 THEN 80
          WHEN LOWER(description) LIKE $2 THEN 60
          ELSE 10
        END AS score
      FROM product_catalog
      WHERE organization_id = $1
        AND is_active = true
        AND (
          LOWER(name) LIKE $2
          OR LOWER(description) LIKE $2
          OR LOWER(category) LIKE $2
        )
      ORDER BY score DESC, name ASC
      LIMIT 5
      `,
      [organization_id, directTerm]
    );

    if (result.rows.length > 0) {
      return result.rows;
    }

    /*
    ========================================
    2. KEYWORD SEARCH
    ========================================
    */

    if (words.length > 0) {
      const clauses = [];
      const values = [organization_id];
      let idx = 2;

      for (const word of words) {
        const likeTerm = `%${word}%`;
        clauses.push(`(
          LOWER(name) LIKE $${idx}
          OR LOWER(description) LIKE $${idx}
          OR LOWER(category) LIKE $${idx}
        )`);
        values.push(likeTerm);
        idx++;
      }

      result = await pool.query(
        `
        SELECT
          id,
          name,
          description,
          price,
          category,
          is_active,
          50 AS score
        FROM product_catalog
        WHERE organization_id = $1
          AND is_active = true
          AND (${clauses.join(" OR ")})
        ORDER BY name ASC
        LIMIT 5
        `,
        values
      );

      if (result.rows.length > 0) {
        return result.rows;
      }
    }

    /*
    ========================================
    3. FALLBACK REAL
    ========================================
    */

    console.log("⚠️ No relevant catalog match, using fallback");

    const fallback = await pool.query(
      `
      SELECT
        id,
        name,
        description,
        price,
        category,
        is_active,
        1 AS score
      FROM product_catalog
      WHERE organization_id = $1
        AND is_active = true
      ORDER BY created_at DESC
      LIMIT 5
      `,
      [organization_id]
    );

    return fallback.rows;
  } catch (err) {
    console.error("❌ Catalog search error:", err);
    return [];
  }
}

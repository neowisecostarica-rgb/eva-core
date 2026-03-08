import pool from "./db.js";

export async function searchCatalog({ organization_id, text }) {
  const keywords = text.toLowerCase();

  const result = await pool.query(
    `
    SELECT p.*, a.url as image
    FROM product_catalog p
    LEFT JOIN product_assets a
      ON a.product_id = p.id
    WHERE p.organization_id = $1
      AND (
        LOWER(p.name) LIKE $2
        OR LOWER(p.brand) LIKE $2
        OR LOWER(p.category) LIKE $2
      )
    LIMIT 3
  `,
    [organization_id, `%${keywords}%`]
  );

  return result.rows;
}

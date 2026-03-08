import pool from "./db.js";

export async function searchCatalog({ organization_id, text }) {

  const words = text.toLowerCase().split(" ");

  const keyword = words.find(w =>
    ["laptop","thinkpad","lenovo","dell","computadora"].includes(w)
  );

  const search = keyword || text;

  const result = await pool.query(
    `
    SELECT 
      p.id,
      p.name,
      p.category,
      p.description,
      p.price_crc,
      a.url as image
    FROM product_catalog p
    LEFT JOIN product_assets a
      ON a.product_id = p.id
    WHERE p.organization_id = $1
      AND p.is_active = true
      AND (
        LOWER(p.name) LIKE $2
        OR LOWER(p.category) LIKE $2
        OR LOWER(p.description) LIKE $2
      )
    LIMIT 3
  `,
    [organization_id, `%${search}%`]
  );

  return result.rows;
}

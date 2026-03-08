import { pool } from "./db.js";

export async function getOrganizationFromApiKey(apiKey) {

  const result = await pool.query(
    `
    SELECT organization_id
    FROM api_keys
    WHERE key = $1
    LIMIT 1
    `,
    [apiKey]
  );

  if (result.rows.length === 0) {
    throw new Error("invalid_api_key");
  }

  return result.rows[0].organization_id;
}

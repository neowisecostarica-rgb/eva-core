import { pool } from "../db.js";

export async function resolveOrganization(req) {

  const header = req.headers.authorization;

  if (!header) {
    throw new Error("missing_api_key");
  }

  const token = header.replace("Bearer ", "").trim();

  const result = await pool.query(
    `
    SELECT id
    FROM organizations
    WHERE api_key = $1
    AND status = 'ACTIVE'
    LIMIT 1
    `,
    [token]
  );

  if (result.rows.length === 0) {
    throw new Error("invalid_api_key");
  }

  return result.rows[0].id;

}

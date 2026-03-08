import { pool } from "./db.js";

export async function registerUsage(organizationId) {

  await pool.query(
    `
    INSERT INTO eva_usage (
      organization_id,
      created_at
    )
    VALUES ($1, NOW())
    `,
    [organizationId]
  );

}

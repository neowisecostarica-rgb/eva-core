import pool from "./db.js";

export async function registerUsage(organizationId, type = "message") {

  await pool.query(
    `
    INSERT INTO eva_usage (
      organization_id,
      usage_type,
      created_at
    )
    VALUES ($1,$2,NOW())
    `,
    [organizationId, type]
  );

}

export async function getUsageToday(organizationId) {

  const result = await pool.query(
    `
    SELECT COUNT(*)
    FROM eva_usage
    WHERE organization_id=$1
    AND created_at >= CURRENT_DATE
    `,
    [organizationId]
  );

  return Number(result.rows[0].count);

}

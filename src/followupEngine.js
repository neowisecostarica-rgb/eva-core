import db from "./db.js";

export async function scheduleFollowup({
  organization_id,
  lead_id,
  phone,
  delay_hours = 24,
  reason = "no_response",
}) {
  const runAt = new Date(Date.now() + delay_hours * 60 * 60 * 1000);

  await db.query(
    `
    INSERT INTO followups (
      organization_id,
      lead_id,
      phone,
      reason,
      run_at,
      status
    )
    VALUES ($1, $2, $3, $4, $5, 'pending')
    `,
    [organization_id, lead_id, phone, reason, runAt]
  );
}

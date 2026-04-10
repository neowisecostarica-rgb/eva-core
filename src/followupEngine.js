/*
====================================================
EVA FOLLOWUP ENGINE (SOT ALIGNED)
====================================================
*/

import db from "./db.js";

export async function scheduleFollowup({
  organization_id,
  lead_id = null,
  phone,
  conversation_id = null,
  delay_hours = 24,
  reason = "sales_followup",
}) {
  try {
    if (!organization_id || !phone) {
      throw new Error("Missing required followup fields");
    }

    const dueAt = new Date(
  Date.now() + delay_hours * 60 * 60 * 1000
);

    await db.query(
      `
      INSERT INTO followups (
        organization_id,
        lead_phone,
        conversation_id,
        reason,
        scheduled_for,
        status,
        attempt,
        sent,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        'PENDING',
        0,
        false,
        NOW(),
        NOW()
      )
      `,
      [
        organization_id,
        phone,
        conversation_id,
        reason,
        scheduledFor,
      ]
    );
  } catch (err) {
    console.error("❌ scheduleFollowup error:", err.message);
  }
}

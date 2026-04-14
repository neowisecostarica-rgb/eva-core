/*
====================================================
EVA CORE — FOLLOWUP ENGINE (CREATION ONLY - FIXED)
====================================================
*/

import db from "./db.js";

/*
====================================================
SCHEDULE FOLLOWUP
====================================================
*/

export async function scheduleFollowup({
  organization_id,
  conversation_id,
  phone,
  delay_hours = 24,
  reason = "sales_followup",
}) {
  try {
    if (!organization_id || !phone) return;

    const due_at = new Date(
      Date.now() + delay_hours * 60 * 60 * 1000
    );

    await db.query(
      `
      INSERT INTO followups (
        organization_id,
        conversation_id,
        lead_phone,
        reason,
        due_at,
        status,
        attempt,
        created_at,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,'PENDING',0,NOW(),NOW())
      `,
      [
        organization_id,
        conversation_id,
        phone,
        reason,
        due_at,
      ]
    );
  } catch (err) {
    console.error("scheduleFollowup error", err.message);
  }
}

/*
====================================================
CREATE FOLLOWUPS (RULES)
====================================================
*/

export async function createFollowupsForConversation({
  organization_id,
  conversation_id,
  phone,
  context,
}) {
  try {
    const stage = context?.stage;

    if (stage === "HOT") return;

    await scheduleFollowup({
      organization_id,
      conversation_id,
      phone,
      delay_hours: 24,
      reason: "followup_24h",
    });

    await scheduleFollowup({
      organization_id,
      conversation_id,
      phone,
      delay_hours: 72,
      reason: "followup_3d",
    });

    await scheduleFollowup({
      organization_id,
      conversation_id,
      phone,
      delay_hours: 168,
      reason: "followup_7d",
    });

  } catch (err) {
    console.error("createFollowups error", err.message);
  }
}

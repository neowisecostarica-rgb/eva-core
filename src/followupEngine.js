/*
====================================================
EVA CORE — FOLLOWUP ENGINE (INTELLIGENT)
====================================================
*/

import db from "./db.js";

export async function scheduleFollowup({
  organization_id,
  conversation_id,
  phone,
  delay_hours,
  reason,
}) {
  try {
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
    console.error(err);
  }
}

export async function createFollowupsForConversation({
  organization_id,
  conversation_id,
  phone,
  context,
}) {
  try {
    const score = context?.score || 0;

    /*
    ========================================
    INTELLIGENT FOLLOWUPS
    ========================================
    */

    if (score >= 85) {
      // seguimiento rápido cierre
      await scheduleFollowup({
        organization_id,
        conversation_id,
        phone,
        delay_hours: 1,
        reason: "hot_close_followup",
      });
      return;
    }

    if (score >= 65) {
      await scheduleFollowup({
        organization_id,
        conversation_id,
        phone,
        delay_hours: 4,
        reason: "warm_followup",
      });
      return;
    }

    // default
    await scheduleFollowup({
      organization_id,
      conversation_id,
      phone,
      delay_hours: 24,
      reason: "standard_followup",
    });

  } catch (err) {
    console.error(err);
  }
}

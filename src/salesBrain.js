async function createFollowupIfNeeded({
  organization_id,
  conversation_id,
  lead_phone,
  lead_score,
  stage,
  reason
}) {

  if (!lead_score || lead_score < 40) return;

  if (stage === "CLOSED") return;

  let hours = 24;

  if (lead_score >= 80) hours = 12;
  else if (lead_score >= 60) hours = 24;
  else hours = 36;

  await pool.query(
    `
    INSERT INTO followups (
      organization_id,
      conversation_id,
      lead_phone,
      reason,
      attempt,
      status,
      due_at,
      created_at,
      updated_at
    )
    VALUES (
      $1,$2,$3,$4,1,'pending',NOW() + ($5 || ' hours')::interval,NOW(),NOW()
    )
    `,
    [
      organization_id,
      conversation_id,
      lead_phone,
      reason,
      hours
    ]
  );

}

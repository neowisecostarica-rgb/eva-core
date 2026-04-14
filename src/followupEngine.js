/*
====================================================
EVA CORE — FOLLOWUP ENGINE (REAL + SOT ALIGNED)
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

    const scheduled_for = new Date(
      Date.now() + delay_hours * 60 * 60 * 1000
    );

    await db.query(
      `
      INSERT INTO followups (
        organization_id,
        conversation_id,
        lead_phone,
        reason,
        scheduled_for,
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
        scheduled_for,
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

    // ❌ NO followups en HOT (ya está cerrando)
    if (stage === "HOT") return;

    // 24h
    await scheduleFollowup({
      organization_id,
      conversation_id,
      phone,
      delay_hours: 24,
      reason: "followup_24h",
    });

    // 3 días
    await scheduleFollowup({
      organization_id,
      conversation_id,
      phone,
      delay_hours: 72,
      reason: "followup_3d",
    });

    // 7 días
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

/*
====================================================
GET PENDING FOLLOWUPS
====================================================
*/

async function getPendingFollowups() {
  const { rows } = await db.query(
    `
    SELECT *
    FROM followups
    WHERE status = 'PENDING'
      AND scheduled_for <= NOW()
    LIMIT 20
    `
  );

  return rows || [];
}

/*
====================================================
MARK SENT
====================================================
*/

async function markFollowupSent(id) {
  await db.query(
    `
    UPDATE followups
    SET status = 'SENT',
        sent = true,
        updated_at = NOW()
    WHERE id = $1
    `,
    [id]
  );
}

/*
====================================================
GET CONTEXT FOR FOLLOWUP
====================================================
*/

async function getFollowupContext(followup) {
  const { organization_id, lead_phone } = followup;

  const convo = await db.query(
    `
    SELECT *
    FROM conversations
    WHERE organization_id = $1
      AND external_user_id = $2
    ORDER BY updated_at DESC
    LIMIT 1
    `,
    [organization_id, lead_phone]
  );

  return convo.rows?.[0] || null;
}

/*
====================================================
BUILD FOLLOWUP MESSAGE
====================================================
*/

function buildFollowupMessage(reason = "followup_24h") {
  if (reason === "followup_24h") {
    return "Hola 😊 solo quería darle seguimiento a su consulta, con gusto le ayudo si aún está interesado.";
  }

  if (reason === "followup_3d") {
    return "Hola, le escribo para saber si aún sigue interesado en la opción que vimos. Con gusto le puedo ayudar 😊";
  }

  if (reason === "followup_7d") {
    return "Hola 😊 solo para comentarle que aún tenemos opciones disponibles en caso de que siga interesado.";
  }

  return "Hola 😊 ¿Le puedo ayudar en algo más?";
}

/*
====================================================
SEND FOLLOWUP (HOOK)
====================================================
*/

async function sendFollowupMessage({ phone, message }) {
  try {
    // ⚠️ usar tu mismo endpoint interno
    await fetch(process.env.EVA_ENDPOINT + "/v1/messages/outbound", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.EVA_API_KEY}`,
      },
      body: JSON.stringify({
        phone,
        text: message,
      }),
    });
  } catch (err) {
    console.error("sendFollowupMessage error", err.message);
  }
}

/*
====================================================
FOLLOWUP WORKER
====================================================
*/

export async function runFollowupWorker() {
  try {
    const pending = await getPendingFollowups();

    for (const followup of pending) {
      const context = await getFollowupContext(followup);

      if (!context) continue;

      const message = buildFollowupMessage(followup.reason);

      await sendFollowupMessage({
        phone: followup.lead_phone,
        message,
      });

      await markFollowupSent(followup.id);
    }

  } catch (err) {
    console.error("runFollowupWorker error", err.message);
  }
}

/*
====================================================
AUTO START WORKER
====================================================
*/

setInterval(() => {
  runFollowupWorker();
}, 60000); // cada 60s

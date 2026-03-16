/*
====================================================
EVA AUTOMATION — FOLLOWUP WORKER
====================================================

Responsabilidad:
Automatizar mensajes de seguimiento para leads que
no respondieron después de una conversación.

Este worker:
• detecta followups vencidos
• verifica si el cliente respondió
• envía recordatorios
• programa nuevos followups

Arquitectura futura:
automation/followupEngine.js
====================================================
*/

import pool from "./db.js";

const MAX_ATTEMPTS = 3;


/*
====================================================
FOLLOWUP QUERY
Obtiene followups pendientes que ya vencieron
====================================================
*/

async function getDueFollowups() {

  const result = await pool.query(`
    SELECT *
    FROM followups
    WHERE status = 'pending'
      AND organization_id IS NOT NULL
      AND due_at <= NOW()
  `);

  return result.rows;

}


/*
====================================================
REPLY DETECTION
Verifica si el cliente respondió después del followup
====================================================
*/

async function userRepliedAfterFollowup(followup) {

  const result = await pool.query(
    `
    SELECT id
    FROM messages
    WHERE conversation_id = $1
      AND role = 'user'
      AND created_at > $2
    LIMIT 1
    `,
    [followup.conversation_id, followup.due_at]
  );

  return result.rows.length > 0;

}


/*
====================================================
FOLLOWUP MESSAGE GENERATOR
====================================================
*/

function generateFollowupMessage(followup) {

  if (followup.reason === "hot_lead") {
    return "Hola 🙂 ayer estuviste consultando por un equipo. Si quieres puedo ayudarte a elegir el mejor según tu presupuesto.";
  }

  if (followup.reason === "catalog_sent") {
    return "Hola 🙂 solo quería saber si pudiste ver las opciones que te enviamos.";
  }

  if (followup.reason === "price_question") {
    return "Hola 🙂 si tienes alguna duda sobre el precio o las características del equipo puedo ayudarte.";
  }

  if (followup.reason === "abandoned_chat") {
    return "Hola 🙂 seguimos teniendo equipos disponibles por si todavía estás buscando.";
  }

  return "Hola 🙂 solo quería saber si todavía estás buscando equipo.";

}


/*
====================================================
FOLLOWUP SCHEDULER
Programa el siguiente intento de followup
====================================================
*/

async function scheduleNextFollowup(followup) {

  if (followup.attempt >= MAX_ATTEMPTS) return;

  let hours = 24;

  if (followup.attempt === 1) hours = 48;
  if (followup.attempt === 2) hours = 72;

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
      $1,$2,$3,$4,$5,'pending',NOW() + ($6 || ' hours')::interval,NOW(),NOW()
    )
    `,
    [
      followup.organization_id,
      followup.conversation_id,
      followup.lead_phone,
      followup.reason,
      followup.attempt + 1,
      hours
    ]
  );

}


/*
====================================================
FOLLOWUP STATE UPDATE
Marca followup como enviado
====================================================
*/

async function markFollowupSent(id) {

  await pool.query(
    `
    UPDATE followups
    SET status = 'sent',
        updated_at = NOW()
    WHERE id = $1
    `,
    [id]
  );

}


/*
====================================================
FOLLOWUP PROCESSOR
Motor principal del worker
====================================================
*/

async function processFollowups() {

  const followups = await getDueFollowups();

  if (followups.length === 0) return;

  for (const f of followups) {

    try {

      /*
      ------------------------------------------------
      STEP 1 — CHECK USER RESPONSE
      ------------------------------------------------
      */

      const replied = await userRepliedAfterFollowup(f);

      if (replied) {

        console.log("FOLLOWUP CANCELLED - USER REPLIED", {
          phone: f.lead_phone
        });

        await pool.query(
          `
          UPDATE followups
          SET status = 'cancelled',
              updated_at = NOW()
          WHERE id = $1
          `,
          [f.id]
        );

        continue;

      }


      /*
      ------------------------------------------------
      STEP 2 — GENERATE MESSAGE
      ------------------------------------------------
      */

      const message = generateFollowupMessage(f);


      /*
      ------------------------------------------------
      STEP 3 — SEND MESSAGE
      ------------------------------------------------
      */

      console.log("FOLLOWUP TRIGGERED", {
        phone: f.lead_phone,
        reason: f.reason,
        attempt: f.attempt,
        message
      });

      /*
      AQUÍ irá WhatsApp Cloud API

      await sendWhatsAppMessage(
        f.lead_phone,
        message
      );
      */


      /*
      ------------------------------------------------
      STEP 4 — UPDATE STATE
      ------------------------------------------------
      */

      await markFollowupSent(f.id);


      /*
      ------------------------------------------------
      STEP 5 — SCHEDULE NEXT FOLLOWUP
      ------------------------------------------------
      */

      await scheduleNextFollowup(f);

    } catch (err) {

      console.error("FOLLOWUP ERROR", err);

    }

  }

}


/*
====================================================
WORKER LOOP
====================================================
*/

export function startFollowupWorker() {

  console.log("Followup worker started");

  setInterval(async () => {

    try {

      await processFollowups();

    } catch (err) {

      console.error("Followup worker error", err);

    }

  }, 60000);

}

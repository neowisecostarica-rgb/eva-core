import pool from "./db.js";

const MAX_ATTEMPTS = 3;

/*
-----------------------------------
GET FOLLOWUPS DUE
-----------------------------------
*/

async function getDueFollowups() {

  const result = await pool.query(`
    SELECT *
    FROM followups
    WHERE status = 'pending'
      AND due_at <= NOW()
    ORDER BY due_at ASC
    LIMIT 20
  `);

  return result.rows;

}

/*
-----------------------------------
CHECK IF USER REPLIED
-----------------------------------
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
    [followup.conversation_id, followup.created_at]
  );

  return result.rows.length > 0;

}

/*
-----------------------------------
GENERATE FOLLOWUP MESSAGE
-----------------------------------
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
-----------------------------------
SCHEDULE NEXT FOLLOWUP
-----------------------------------
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
-----------------------------------
MARK FOLLOWUP SENT
-----------------------------------
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
-----------------------------------
PROCESS FOLLOWUPS
-----------------------------------
*/

async function processFollowups() {

  const followups = await getDueFollowups();

  if (followups.length === 0) return;

  for (const f of followups) {

    try {

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

      const message = generateFollowupMessage(f);

      console.log("FOLLOWUP TRIGGERED", {
        phone: f.lead_phone,
        reason: f.reason,
        attempt: f.attempt,
        message
      });

      /*
      AQUÍ irá WhatsApp Cloud API
      await sendWhatsAppMessage(f.lead_phone, message);
      */

      await markFollowupSent(f.id);

      await scheduleNextFollowup(f);

    } catch (err) {

      console.error("FOLLOWUP ERROR", err);

    }

  }

}

/*
-----------------------------------
WORKER LOOP
-----------------------------------
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

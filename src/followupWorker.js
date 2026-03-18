/*
====================================================
EVA FOLLOWUP WORKER (HARDENED P0)
====================================================
*/

import pool from "./db.js";

/*
====================================================
MESSAGE BUILDER
====================================================
*/

function buildFollowupMessage(reason) {

  if (reason === "sales_followup") {
    return `Hola 🙌

Ayer estuviste consultando por nuestros equipos.

Si todavía estás buscando laptop o accesorios con gusto puedo ayudarte.

¿La ocupas para estudio o trabajo?`;
  }

  if (reason === "sales_followup_2") {
    return `Hola 👋

Todavía tenemos unidades disponibles de los equipos que viste.

Son línea corporativa y se van rápido 🙌

Si quieres te ayudo a elegir el ideal.`;
  }

  if (reason === "sales_followup_3") {
    return `Hola 🙌

Te escribo por última vez sobre los equipos que consultaste.

Si todavía estás interesado puedo ayudarte a reservar uno antes de que se acaben.

Quedo atento 👍`;
  }

  return `Hola 🙌 ¿Aún necesitas ayuda?`;
}

/*
====================================================
PROCESS FOLLOWUPS
====================================================
*/

export async function processFollowups(sendMessage) {
  try {
    const result = await pool.query(`
      SELECT *
      FROM followups
      WHERE status = 'PENDING'
      AND scheduled_for <= NOW()
      ORDER BY scheduled_for ASC
      LIMIT 20
    `);

    const followups = result.rows;

    if (!followups.length) return;

    for (const f of followups) {
      try {
        /*
        ------------------------------------------------
        LOCK (CRÍTICO)
        ------------------------------------------------
        */

        const lock = await pool.query(
          `
          UPDATE followups
          SET status = 'RUNNING',
              updated_at = NOW()
          WHERE id = $1
          AND status = 'PENDING'
          RETURNING *
        `,
          [f.id]
        );

        if (!lock.rowCount) {
          // otro worker ya lo tomó
          continue;
        }

        const followup = lock.rows[0];

        /*
        ------------------------------------------------
        VALIDATION
        ------------------------------------------------
        */

        if (!followup.lead_phone) {
          console.warn("FOLLOWUP WITHOUT PHONE", followup.id);

          await pool.query(
            `
            UPDATE followups
            SET status = 'FAILED',
                last_error = 'Missing phone'
            WHERE id = $1
          `,
            [followup.id]
          );

          continue;
        }

        /*
        ------------------------------------------------
        BUILD MESSAGE
        ------------------------------------------------
        */

        const message = buildFollowupMessage(followup.reason);

        /*
        ------------------------------------------------
        SEND MESSAGE
        ------------------------------------------------
        */

        await sendMessage({
          phone: followup.lead_phone,
          message
        });

   /*
------------------------------------------------
SUCCESS
------------------------------------------------
*/

await pool.query(
  `
  UPDATE followups
  SET status = 'DONE',
      updated_at = NOW()
  WHERE id = $1
`,
  [followup.id]
);

/*
------------------------------------------------
SEQUENCE ENGINE
------------------------------------------------
*/

try {

  let nextDelay = null;
  let nextReason = null;

  if (followup.reason === "sales_followup") {
    nextDelay = 3 * 24 * 60 * 60 * 1000; // +3 días
    nextReason = "sales_followup_2";
  }

  else if (followup.reason === "sales_followup_2") {
    nextDelay = 7 * 24 * 60 * 60 * 1000; // +7 días
    nextReason = "sales_followup_3";
  }

  if (nextDelay && nextReason) {

    const scheduledFor = new Date(Date.now() + nextDelay);

    await pool.query(
      `
      INSERT INTO followups (
        organization_id,
        lead_phone,
        reason,
        scheduled_for,
        status,
        attempt_count,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, 'PENDING', 0, NOW(), NOW())
    `,
      [
        followup.organization_id,
        followup.lead_phone,
        nextReason,
        scheduledFor
      ]
    );

  }

} catch (err) {
  console.error("FOLLOWUP SEQUENCE ERROR", err.message);
}

        /*
        ------------------------------------------------
        ERROR HANDLING
        ------------------------------------------------
        */

        await pool.query(
          `
          UPDATE followups
          SET status = 'FAILED',
              attempt_count = attempt_count + 1,
              last_error = $2,
              updated_at = NOW()
          WHERE id = $1
        `,
          [f.id, err.message || "unknown error"]
        );
      }
    }
  } catch (err) {
    console.error("FOLLOWUP WORKER ERROR", err);
  }
}

/*
====================================================
WORKER LOOP
====================================================
*/

let isRunning = false;

export function startFollowupWorker(sendMessage) {
  console.log("EVA FOLLOWUP WORKER STARTED");

  setInterval(async () => {
    if (isRunning) return;

    try {
      isRunning = true;
      await processFollowups(sendMessage);
    } catch (err) {
      console.error("WORKER LOOP ERROR", err);
    } finally {
      isRunning = false;
    }
  }, 120000); // cada 2 min
}

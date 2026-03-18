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

Si todavía estás buscando laptop o accesorios con gusto puedo ayudarte a encontrar una buena opción según lo que necesites.

¿La ocupas para estudio o trabajo?`;
  }

  return `Hola 🙌

Solo quería saber si todavía necesitas ayuda con lo que estabas consultando.

Estoy aquí para ayudarte.`;
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
      } catch (err) {
        console.error("FOLLOWUP ERROR", err);

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

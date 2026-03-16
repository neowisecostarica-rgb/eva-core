/*
====================================================
EVA FOLLOWUP WORKER
Automated Sales Follow-Up Engine
====================================================

Este worker revisa followups pendientes
y envía mensajes automáticamente.

Recupera ventas cuando el cliente
dejó de responder.

Estrategia típica:

24h → recordatorio suave
3 días → urgencia ligera
7 días → último intento

====================================================
*/

import pool from "./db.js";

/*
====================================================
FOLLOWUP MESSAGE GENERATOR
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
      WHERE scheduled_for <= NOW()
      AND sent = false
      ORDER BY scheduled_for ASC
      LIMIT 20
    `);

    const followups = result.rows;

    if (!followups.length) {
      return;
    }

    for (const followup of followups) {

      const message = buildFollowupMessage(followup.reason);

      try {

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
        MARK AS SENT
        ------------------------------------------------
        */

        await pool.query(`
          UPDATE followups
          SET sent = true,
              sent_at = NOW()
          WHERE id = $1
        `, [followup.id]);

      } catch (err) {

        console.error("FOLLOWUP SEND ERROR", err);

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

export function startFollowupWorker(sendMessage) {

  console.log("EVA FOLLOWUP WORKER STARTED");

  setInterval(async () => {

    await processFollowups(sendMessage);

  }, 120000); // cada 2 minutos

}

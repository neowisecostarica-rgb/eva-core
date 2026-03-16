/*
====================================================
EVA FOLLOWUP WORKER
Automated Sales Follow-Up Engine
====================================================

Responsabilidades:

• Revisar followups pendientes
• Enviar mensajes automáticos
• Registrar mensajes en CRM
• Evitar followups innecesarios
• Mantener estrategia comercial

Estrategia:

24h → recordatorio suave
3 días → urgencia ligera
7 días → último intento

Este worker corre continuamente.
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
CHECK IF CLIENT RESPONDED
====================================================
*/

async function clientRespondedAfter(conversation_id, scheduled_for) {

  const result = await pool.query(`
    SELECT id
    FROM messages
    WHERE conversation_id = $1
      AND role = 'user'
      AND created_at > $2
    LIMIT 1
  `, [conversation_id, scheduled_for]);

  return result.rows.length > 0;
}

/*
====================================================
SAVE MESSAGE TO CRM
====================================================
*/

async function saveAssistantMessage({
  organization_id,
  conversation_id,
  message
}) {

  await pool.query(`
    INSERT INTO messages (
      organization_id,
      conversation_id,
      role,
      content,
      created_at
    )
    VALUES ($1, $2, 'assistant', $3, NOW())
  `, [
    organization_id,
    conversation_id,
    message
  ]);

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
      AND status = 'pending'
      ORDER BY scheduled_for ASC
      LIMIT 20
    `);

    const followups = result.rows;

    if (!followups.length) {
      return;
    }

    for (const followup of followups) {

      /*
      ------------------------------------------------
      SKIP IF CLIENT ALREADY RESPONDED
      ------------------------------------------------
      */

      const clientAnswered = await clientRespondedAfter(
        followup.conversation_id,
        followup.scheduled_for
      );

      if (clientAnswered) {

        await pool.query(`
          UPDATE followups
          SET status = 'cancelled'
          WHERE id = $1
        `, [followup.id]);

        continue;

      }

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
        SAVE MESSAGE IN CRM
        ------------------------------------------------
        */

        await saveAssistantMessage({
          organization_id: followup.organization_id,
          conversation_id: followup.conversation_id,
          message
        });

        /*
        ------------------------------------------------
        MARK FOLLOWUP AS SENT
        ------------------------------------------------
        */

        await pool.query(`
          UPDATE followups
          SET status = 'sent',
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

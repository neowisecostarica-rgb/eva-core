/*
====================================================
EVA FOLLOWUP WORKER (SMART + HARDENED)
====================================================
*/

import pool from "./db.js";

/*
====================================================
MESSAGE BUILDER (CONTEXTUAL)
====================================================
*/

function buildFollowupMessage(followup, memory = {}) {

  const { reason } = followup;

  const useCaseText = {
    ESTUDIO: "para estudio",
    TRABAJO: "para trabajo",
    GAMING: "para gaming"
  };

  const useCase = memory?.use_case
    ? useCaseText[memory.use_case] || ""
    : "";

  /*
  ====================================================
  FOLLOWUP 1 (24H)
  ====================================================
  */

  if (reason === "sales_followup") {
    return `Hola 🙌

Ayer estuviste consultando ${useCase ? useCase : "sobre laptops"}.

Si todavía estás buscando, puedo ayudarte a encontrar una buena opción según lo que necesitas 👇

¿Quieres que te recomiende una opción disponible ahora?`;
  }

  /*
  ====================================================
  FOLLOWUP 2 (3 DÍAS)
  ====================================================
  */

  if (reason === "sales_followup_2") {
    return `Hola 👋

Todavía tenemos unidades disponibles ${useCase ? useCase : ""}.

Son equipos línea corporativa y se van rápido 🙌

Si quieres te ayudo a elegir el ideal para ti.`;
  }

  /*
  ====================================================
  FOLLOWUP 3 (7 DÍAS)
  ====================================================
  */

  if (reason === "sales_followup_3") {
    return `Hola 🙌

Te escribo por última vez sobre ${useCase ? useCase : "los equipos que consultaste"}.

Si todavía estás interesado puedo ayudarte a reservar uno antes de que se acaben.

Quedo atento 👍`;
  }

  /*
  ====================================================
  DEFAULT
  ====================================================
  */

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

        if (!lock.rowCount) continue;

        const followup = lock.rows[0];
/*
------------------------------------------------
ANTI-SPAM / ACTIVIDAD RECIENTE
------------------------------------------------
*/

try {

  // evitar followup si ya fue enviado recientemente
  if (followup.sent === true) {
    await pool.query(
      `
      UPDATE followups
      SET status = 'CANCELLED',
          updated_at = NOW()
      WHERE id = $1
      `,
      [followup.id]
    );
    continue;
  }

  // evitar followup si hay otro followup pendiente más reciente
  const newer = await pool.query(
    `
    SELECT id FROM followups
    WHERE organization_id = $1
    AND lead_phone = $2
    AND status = 'PENDING'
    AND scheduled_for > $3
    LIMIT 1
    `,
    [
      followup.organization_id,
      followup.lead_phone,
      followup.scheduled_for
    ]
  );

  if (newer.rowCount) {
    await pool.query(
      `
      UPDATE followups
      SET status = 'CANCELLED',
          updated_at = NOW()
      WHERE id = $1
      `,
      [followup.id]
    );
    continue;
  }

} catch (err) {
  console.warn("⚠️ anti-spam check error", err.message);
}
        
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
        LOAD MEMORY (NUEVO 🔥)
        ------------------------------------------------
        */

        let memory = {};

        try {
          const memResult = await pool.query(
            `
            SELECT use_case, budget_crc, product_interest
            FROM leads
            WHERE phone = $1
            LIMIT 1
          `,
            [followup.lead_phone]
          );

          memory = memResult.rows[0] || {};
        } catch (err) {
          console.warn("⚠️ followup memory error", err.message);
        }

        /*
        ------------------------------------------------
        BUILD MESSAGE (CON MEMORIA)
        ------------------------------------------------
        */

        const message = buildFollowupMessage(followup, memory);

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
      sent = true,
      sent_at = NOW(),
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
            nextDelay = 3 * 24 * 60 * 60 * 1000;
            nextReason = "sales_followup_2";
          } else if (followup.reason === "sales_followup_2") {
            nextDelay = 7 * 24 * 60 * 60 * 1000;
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

      } catch (err) {

        console.error("FOLLOWUP ERROR", err);

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
  }, 120000);
}

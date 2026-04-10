/*
====================================================
EVA FOLLOWUP WORKER (SMART v2 — FIXED)
====================================================
*/

import pool from "./db.js";

/*
====================================================
MESSAGE BUILDER (INTELIGENTE)
====================================================
*/

function buildFollowupMessage({ followup, memory = {}, lastMessage = null }) {
  const { reason } = followup;

  const useCase = memory?.use_case || null;
  const product = memory?.product_interest || "los equipos que consultaste";

  const lastUserText = lastMessage?.content?.toLowerCase?.() || "";

  /*
  ====================================================
  DETECT CONTEXT SIGNALS
  ====================================================
  */

  const askedPrice =
    lastUserText.includes("precio") ||
    lastUserText.includes("cuánto");

  const highIntent =
    lastUserText.includes("quiero") ||
    lastUserText.includes("me interesa");

  /*
  ====================================================
  FOLLOWUP LOGIC
  ====================================================
  */

  if (reason === "sales_followup") {
    if (askedPrice) {
      return `Hola 😊

Ayer me consultaste sobre el precio.

Si quieres, puedo ayudarte a encontrar la mejor opción según tu presupuesto 👌

¿En qué rango estás buscando?`;
    }

    if (highIntent) {
      return `Hola 🙌

Ayer mostraste interés en ${product}.

Si todavía estás buscando, puedo ayudarte a elegir una buena opción disponible ahora 👇

¿Te gustaría que te recomiende una?`;
    }

    return `Hola 😊

Quedé atento a tu mensaje anterior.

Si aún estás buscando ${product}, con gusto te ayudo a encontrar una buena opción 👌

¿Para qué uso la necesitas?`;
  }

  if (reason === "sales_followup_2") {
    return `Hola 👋

Todavía tenemos opciones disponibles ${useCase ? "para " + useCase : ""}.

Son equipos línea corporativa y se están moviendo rápido 🙌

Si quieres te ayudo a elegir el ideal para ti.`;
  }

  if (reason === "sales_followup_3") {
    return `Hola 🙌

Te escribo por última vez sobre ${product}.

Si todavía estás interesado puedo ayudarte a reservar uno antes de que se agoten.

Quedo atento 👍`;
  }

  return `Hola 😊 ¿Aún necesitas ayuda?`;
}

/*
====================================================
PROCESS FOLLOWUPS
====================================================
*/

export async function processFollowups(sendMessage) {
  try {
    const { rows: followups } = await pool.query(
      `
      SELECT *
      FROM followups
      WHERE status = 'PENDING'
        AND scheduled_for <= NOW()
      ORDER BY scheduled_for ASC
      LIMIT 20
      `
    );

    if (!followups.length) return;

    for (const f of followups) {
      try {
        /*
        ------------------------------------------------
        LOCK
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
        VALIDATION
        ------------------------------------------------
        */

        if (!followup.lead_phone) {
          await pool.query(
            `
            UPDATE followups
            SET status = 'FAILED',
                updated_at = NOW()
            WHERE id = $1
            `,
            [followup.id]
          );
          continue;
        }

        /*
        ------------------------------------------------
        🔥 ANTI-SPAM / CONTROL
        ------------------------------------------------
        */

        try {
          // cancelar si hay uno más nuevo
          const newer = await pool.query(
            `
            SELECT id
            FROM followups
            WHERE organization_id = $1
              AND lead_phone = $2
              AND status = 'PENDING'
              AND scheduled_for > $3
            LIMIT 1
            `,
            [
              followup.organization_id,
              followup.lead_phone,
              followup.scheduled_for,
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
          console.warn("⚠️ anti-spam error", err.message);
        }

        /*
        ------------------------------------------------
        LOAD MEMORY
        ------------------------------------------------
        */

        let memory = {};
        let lastMessage = null;

        try {
          const memResult = await pool.query(
            `
            SELECT use_case, budget, product_interest, interest_level
            FROM leads
            WHERE phone = $1
              AND organization_id = $2
            LIMIT 1
            `,
            [followup.lead_phone, followup.organization_id]
          );

          memory = memResult.rows[0] || {};
        } catch (err) {
          console.warn("⚠️ memory error", err.message);
        }

        /*
        ------------------------------------------------
        🔥 CANCEL IF HOT LEAD
        ------------------------------------------------
        */

        if (memory?.interest_level === "HIGH") {
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

        /*
        ------------------------------------------------
        LOAD LAST MESSAGE
        ------------------------------------------------
        */

        try {
          if (followup.conversation_id) {
            const lastMessageRes = await pool.query(
              `
              SELECT role, content, created_at
              FROM messages
              WHERE conversation_id = $1
              ORDER BY created_at DESC
              LIMIT 1
              `,
              [followup.conversation_id]
            );

            lastMessage = lastMessageRes.rows[0] || null;

            // cancelar si el cliente ya respondió
            if (
              lastMessage &&
              lastMessage.role === "user" &&
              new Date(lastMessage.created_at) > new Date(followup.created_at)
            ) {
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
          }
        } catch (err) {
          console.warn("⚠️ last message error", err.message);
        }

        /*
        ------------------------------------------------
        BUILD MESSAGE
        ------------------------------------------------
        */

        const message = buildFollowupMessage({
          followup,
          memory,
          lastMessage,
        });

        if (!message || typeof message !== "string" || !message.trim()) {
          await pool.query(
            `
            UPDATE followups
            SET status = 'FAILED',
                attempt = COALESCE(attempt, 0) + 1,
                updated_at = NOW()
            WHERE id = $1
            `,
            [followup.id]
          );
          continue;
        }

        /*
        ------------------------------------------------
        SEND
        ------------------------------------------------
        */

        await sendMessage({
          phone: followup.lead_phone,
          message,
        });

        /*
        ------------------------------------------------
        SUCCESS
        ------------------------------------------------
        */

        await pool.query(
          `
          UPDATE followups
          SET status = 'SENT',
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
                conversation_id,
                reason,
                scheduled_for,
                status,
                attempt,
                sent,
                created_at,
                updated_at
              )
              VALUES ($1, $2, $3, $4, $5, 'PENDING', 0, false, NOW(), NOW())
              `,
              [
                followup.organization_id,
                followup.lead_phone,
                followup.conversation_id,
                nextReason,
                scheduledFor,
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
              attempt = COALESCE(attempt, 0) + 1,
              updated_at = NOW()
          WHERE id = $1
          `,
          [f.id]
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

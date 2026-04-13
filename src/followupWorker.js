/*
====================================================
EVA FOLLOWUP WORKER (vNext — PRODUCTION SAFE)
====================================================
*/

import pool from "./db.js";
import OpenAI from "openai";

/*
====================================================
OPENAI
====================================================
*/

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/*
====================================================
HELPERS
====================================================
*/

function safe(v) {
  return String(v || "").trim();
}

/*
====================================================
AI FOLLOWUP
====================================================
*/

async function generateAIFollowup({ memory, lastMessage }) {
  try {
    if (!openai) return null;

    const lastUserText = (lastMessage?.content || "").toLowerCase();

    const prompt = `
Eres una asesora de ventas por WhatsApp.

OBJETIVO:
Reactivar la conversación y llevar al cliente a una acción concreta.

CONTEXTO:
Producto: ${memory?.product_interest || "producto"}
Uso: ${memory?.use_case || "general"}
Último mensaje: ${lastUserText}

REGLAS:
- Máximo 3 líneas
- Máximo 1 emoji
- Natural
- Terminar en acción

Responde SOLO el mensaje.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      messages: [{ role: "user", content: prompt }],
    });

    const text = completion?.choices?.[0]?.message?.content?.trim();

    if (!text || text.length < 10) return null;

    return text.length > 320 ? text.slice(0, 300) + "…" : text;

  } catch (err) {
    console.warn("⚠️ AI followup error:", err.message);
    return null;
  }
}

/*
====================================================
FALLBACK MESSAGE
====================================================
*/

function buildFollowupMessage({ memory }) {
  const product =
    memory?.product_interest ||
    memory?.use_case ||
    "lo que estabas buscando";

  return `Hola 😊

Quedé pendiente de tu consulta.

Si aún estás buscando ${product}, con gusto te ayudo 👌

¿Para qué uso la necesitas?`;
}

/*
====================================================
SEND SAFE (CRÍTICO)
====================================================
*/

async function sendMessageSafe(sendMessage, payload) {
  try {
    const result = await sendMessage(payload);

    // 🔥 VALIDACIÓN CRÍTICA
    if (!result || result.error) {
      return { success: false };
    }

    return { success: true };

  } catch (err) {
    return { success: false };
  }
}

/*
====================================================
PROCESS FOLLOWUPS
====================================================
*/

export async function processFollowups(sendMessage) {
  try {
    const { rows: followups } = await pool.query(`
      SELECT *
      FROM followups
      WHERE status = 'PENDING'
        AND due_at <= NOW()
      ORDER BY due_at ASC
      LIMIT 20
    `);

    if (!followups.length) return;

    for (const f of followups) {
      try {
        /*
        --------------------------------
        LOCK
        --------------------------------
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
        --------------------------------
        VALIDACIÓN
        --------------------------------
        */

        if (!followup.lead_phone) {
          await pool.query(
            `UPDATE followups SET status = 'FAILED' WHERE id = $1`,
            [followup.id]
          );
          continue;
        }

        /*
        --------------------------------
        MEMORY
        --------------------------------
        */

        const memResult = await pool.query(
          `
          SELECT use_case, budget, product_interest, interest_level
          FROM leads
          WHERE phone = $1 AND organization_id = $2
          LIMIT 1
          `,
          [followup.lead_phone, followup.organization_id]
        );

        const memory = memResult.rows[0] || {};

        /*
        🔥 FIX: NO cancelar HIGH intent
        */

        /*
        --------------------------------
        LAST MESSAGE
        --------------------------------
        */

        let lastMessage = null;

        if (followup.conversation_id) {
          const res = await pool.query(
            `
            SELECT role, content, created_at
            FROM messages
            WHERE conversation_id = $1
            ORDER BY created_at DESC
            LIMIT 1
            `,
            [followup.conversation_id]
          );

          lastMessage = res.rows[0] || null;

          if (
            lastMessage &&
            lastMessage.role === "user" &&
            new Date(lastMessage.created_at) > new Date(followup.created_at)
          ) {
            await pool.query(
              `UPDATE followups SET status = 'CANCELLED' WHERE id = $1`,
              [followup.id]
            );
            continue;
          }
        }

        /*
        --------------------------------
        MESSAGE
        --------------------------------
        */

        let message =
          (await generateAIFollowup({ memory, lastMessage })) ||
          buildFollowupMessage({ memory });

        if (!message) continue;

        /*
        --------------------------------
        SEND (SAFE)
        --------------------------------
        */

        const sendResult = await sendMessageSafe(sendMessage, {
          phone: followup.lead_phone,
          message,
        });

        if (!sendResult.success) {
          // 🔥 RETRY CONTROL
          await pool.query(
            `
            UPDATE followups
            SET status = 'FAILED',
                attempt = attempt + 1
            WHERE id = $1
            `,
            [followup.id]
          );
          continue;
        }

        /*
        --------------------------------
        SUCCESS
        --------------------------------
        */

        await pool.query(
          `
          UPDATE followups
          SET status = 'SENT',
              sent = true,
              sent_at = NOW()
          WHERE id = $1
          `,
          [followup.id]
        );

      } catch (err) {
        console.error("FOLLOWUP ERROR", err);
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

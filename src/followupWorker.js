/*
====================================================
EVA FOLLOWUP WORKER (Sales Radar + Conversion vNext)
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
UTILS
====================================================
*/

function safe(v) {
  return String(v || "").trim();
}

function clamp(text, max = 320) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

/*
====================================================
PIPELINE EVENT
====================================================
*/

async function saveEvent({ organization_id, lead_phone, event_type, metadata = {} }) {
  try {
    await pool.query(
      `
      INSERT INTO pipeline_events (
        organization_id,
        lead_phone,
        event_type,
        metadata,
        created_at
      )
      VALUES ($1, $2, $3, $4::jsonb, NOW())
      `,
      [organization_id, lead_phone, event_type, JSON.stringify(metadata)]
    );
  } catch (err) {
    console.error("❌ followup event error:", err);
  }
}

/*
====================================================
AI FOLLOWUP
====================================================
*/

async function generateAIFollowup({ memory, lastMessage, isHighIntent }) {
  try {
    if (!openai) return null;

    const lastUserText = (lastMessage?.content || "").toLowerCase();

    const prompt = `
Eres una asesora de ventas por WhatsApp.

OBJETIVO:
Reactivar conversación y llevar a acción.

CONTEXTO:
Producto: ${memory?.product_interest || "producto"}
Uso: ${memory?.use_case || "general"}
Último mensaje: ${lastUserText}

TIPO CLIENTE:
${isHighIntent ? "ALTO INTERÉS" : "INTERÉS NORMAL"}

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

    return clamp(text);

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

function buildFollowupMessage({ memory, isHighIntent }) {
  const product =
    memory?.product_interest ||
    memory?.use_case ||
    "lo que estabas buscando";

  if (isHighIntent) {
    return `Hola 😊

Quedé pendiente con tu compra.

Si gusta te lo dejo apartado de una vez y coordinamos 👍`;
  }

  return `Hola 😊

Quedé pendiente de tu consulta.

Si aún estás buscando ${product}, con gusto te ayudo 👌`;
}

/*
====================================================
SEND SAFE
====================================================
*/

async function sendMessageSafe(sendMessage, payload) {
  try {
    const result = await sendMessage(payload);

    if (!result || result.error) {
      return { success: false };
    }

    return { success: true };

  } catch {
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
        ========================================
        LOCK
        ========================================
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
        ========================================
        VALIDATION
        ========================================
        */

        if (!followup.lead_phone) {
          await pool.query(
            `UPDATE followups SET status = 'FAILED' WHERE id = $1`,
            [followup.id]
          );
          continue;
        }

        /*
        ========================================
        MEMORY
        ========================================
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
        const isHighIntent =
          String(memory?.interest_level || "LOW").toUpperCase() === "HIGH";

        /*
        ========================================
        LAST MESSAGE
        ========================================
        */

        let lastMessage = null;

        if (followup.conversation_id) {
          const res = await pool.query(
            `
            SELECT role, content, created_at
            FROM messages
            WHERE conversation_id = $1
              AND organization_id = $2
            ORDER BY created_at DESC
            LIMIT 1
            `,
            [followup.conversation_id, followup.organization_id]
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
        ========================================
        MESSAGE
        ========================================
        */

        let message =
          (await generateAIFollowup({
            memory,
            lastMessage,
            isHighIntent,
          })) ||
          buildFollowupMessage({ memory, isHighIntent });

        if (!message) continue;

        /*
        ========================================
        SEND
        ========================================
        */

        const sendResult = await sendMessageSafe(sendMessage, {
          phone: followup.lead_phone,
          message,
        });

        if (!sendResult.success) {
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
        ========================================
        EVENTS (🔥 RADAR)
        ========================================
        */

        await saveEvent({
          organization_id: followup.organization_id,
          lead_phone: followup.lead_phone,
          event_type: "followup_sent",
        });

        await saveEvent({
          organization_id: followup.organization_id,
          lead_phone: followup.lead_phone,
          event_type: "followup_recovery_attempt",
        });

        if (isHighIntent) {
          await saveEvent({
            organization_id: followup.organization_id,
            lead_phone: followup.lead_phone,
            event_type: "followup_high_intent_push",
          });
        }

        /*
        ========================================
        SUCCESS
        ========================================
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

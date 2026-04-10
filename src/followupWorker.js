/*
====================================================
EVA FOLLOWUP WORKER (SMART v4 — AI CLOSE MODE FIXED)
====================================================
*/

import pool from "./db.js";
import OpenAI from "openai";

/*
====================================================
OPENAI (SAFE INIT)
====================================================
*/

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/*
====================================================
MESSAGE BUILDER (FALLBACK V2)
====================================================
*/

function buildFollowupMessage({ followup, memory = {}, lastMessage = null }) {
  const { reason } = followup;

  const useCase = memory?.use_case || null;
  const product =
    memory?.product_interest ||
    memory?.use_case ||
    "la opción que estabas viendo";

  const lastUserText = lastMessage?.content?.toLowerCase?.() || "";

  const askedPrice =
    lastUserText.includes("precio") ||
    lastUserText.includes("cuánto");

  const highIntent =
    lastUserText.includes("quiero") ||
    lastUserText.includes("me interesa");

  if (reason === "sales_followup") {
    if (askedPrice) {
      return `Hola 😊

Ayer me consultaste sobre el precio.

Si quieres, puedo ayudarte a encontrar una opción que se ajuste a tu presupuesto 👌

¿En qué rango estás buscando?`;
    }

    if (highIntent) {
      return `Hola 🙌

Ayer mostraste interés en ${product}.

Si todavía estás buscando, puedo recomendarte una opción disponible ahora 👇

¿Quieres que te pase una?`;
    }

    return `Hola 😊

Quedé atento a tu mensaje.

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
AI FOLLOWUP (V4 — CLOSE MODE)
====================================================
*/

function buildAIFollowupPrompt({ memory, lastMessage }) {
  const product = memory?.product_interest || "el equipo que consultaste";
  const useCase = memory?.use_case || "lo que necesitas";
  const lastUserText = lastMessage?.content || "";

  return `
Eres una asesora de ventas por WhatsApp.

OBJETIVO:
Reactivar la conversación y llevar al cliente a un siguiente paso concreto.

CONTEXTO:
- Producto: ${product}
- Uso: ${useCase}
- Último mensaje del cliente: ${lastUserText}

REGLAS:
- Máximo 3 líneas
- Máximo 1 emoji
- Sonar natural y humano
- No sonar insistente
- Sugerir una opción concreta
- Reducir fricción
- Terminar con una pregunta de acción

EJEMPLOS:
- "Te puedo recomendar una opción que te funcione bien sin subirte mucho el presupuesto"
- "Si quieres te paso una opción disponible ahora"
- "Te puedo dejar una opción lista para entrega"

Responde SOLO el mensaje.
`;
}

async function generateAIFollowup({ memory, lastMessage }) {
  try {
    if (!openai) return null;

    const prompt = buildAIFollowupPrompt({ memory, lastMessage });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      messages: [{ role: "user", content: prompt }],
    });

    const text = completion?.choices?.[0]?.message?.content?.trim();

    if (!text || text.length < 10) return null;

    if (text.length > 320) {
      return text.slice(0, 300) + "…";
    }

    return text;
  } catch (err) {
    console.warn("⚠️ AI followup error:", err.message);
    return null;
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

        if (!followup.lead_phone) {
          await pool.query(
            `UPDATE followups SET status = 'FAILED' WHERE id = $1`,
            [followup.id]
          );
          continue;
        }

        /*
        -------------------------------
        ANTI-SPAM
        -------------------------------
        */

        const newer = await pool.query(
          `
          SELECT id FROM followups
          WHERE organization_id = $1
            AND lead_phone = $2
            AND status = 'PENDING'
            AND due_at > $3
          LIMIT 1
          `,
          [
            followup.organization_id,
            followup.lead_phone,
            followup.due_at,
          ]
        );

        if (newer.rowCount) {
          await pool.query(
            `UPDATE followups SET status = 'CANCELLED' WHERE id = $1`,
            [followup.id]
          );
          continue;
        }

        /*
        -------------------------------
        MEMORY
        -------------------------------
        */

        let memory = {};
        let lastMessage = null;

        const memResult = await pool.query(
          `
          SELECT use_case, budget, product_interest, interest_level
          FROM leads
          WHERE phone = $1 AND organization_id = $2
          LIMIT 1
          `,
          [followup.lead_phone, followup.organization_id]
        );

        memory = memResult.rows[0] || {};

        if (memory?.interest_level === "HIGH") {
          await pool.query(
            `UPDATE followups SET status = 'CANCELLED' WHERE id = $1`,
            [followup.id]
          );
          continue;
        }

        /*
        -------------------------------
        LAST MESSAGE
        -------------------------------
        */

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
        -------------------------------
        MESSAGE (AI + FALLBACK)
        -------------------------------
        */

        let message = null;

        if (followup.reason === "sales_followup") {
          const aiMessage = await generateAIFollowup({
            memory,
            lastMessage,
          });

          if (aiMessage) {
            message = aiMessage;
          }
        }

        if (!message) {
          message = buildFollowupMessage({
            followup,
            memory,
            lastMessage,
          });
        }

        if (!message) continue;

        /*
        -------------------------------
        SEND
        -------------------------------
        */

        await sendMessage({
          phone: followup.lead_phone,
          message,
        });

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

        /*
        -------------------------------
        SEQUENCE
        -------------------------------
        */

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
          const dueAt = new Date(Date.now() + nextDelay);

          await pool.query(
            `
            INSERT INTO followups (
              organization_id,
              lead_phone,
              conversation_id,
              reason,
              due_at,
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
              dueAt,
            ]
          );
        }
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

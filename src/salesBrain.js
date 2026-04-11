/*
====================================================
EVA CORE — SALES BRAIN (BLOCK 3 — ORCHESTRATED)
====================================================
*/

import OpenAI from "openai";

import {
  findOrCreateLead,
  findOrCreateConversation,
  saveMessage,
} from "./db.js";

import { scheduleFollowup } from "./followupEngine.js";

import { detectIntent } from "./brain/engines/intentEngine.js";
import {
  decideStrategy,
  normalizeIntent,
  normalizeStage,
} from "./brain/engines/strategyEngine.js";

import { buildContext } from "./contextBuilder.js";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/*
====================================================
UTILS
====================================================
*/

function safeString(v) {
  return String(v || "").trim();
}

function clampText(text, max = 420) {
  const t = safeString(text).replace(/\s+/g, " ");
  if (!t) return "";
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trim() + "…";
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/*
====================================================
AI
====================================================
*/

function normalizeAssistantOutput(raw) {
  if (!raw) return { reply: "", confidence: 0 };

  if (typeof raw === "object") {
    return {
      reply: safeString(raw.reply),
      confidence: Number(raw.confidence || 0),
    };
  }

  const parsed = tryParseJson(raw);

  if (parsed) {
    return {
      reply: safeString(parsed.reply),
      confidence: Number(parsed.confidence || 0),
    };
  }

  return {
    reply: safeString(raw),
    confidence: 0.5,
  };
}

function shouldUseAI({ intent }) {
  if (!openai) return false;
  if (intent === "GREETING") return false;
  return true;
}

function buildPrompt({ context }) {
  return `
Eres ${context.assistant.name} de ${context.organization.business_name}.

OBJETIVO:
Guiar la conversación hacia una acción comercial.

REGLAS:
- No inventar
- Máximo 1 emoji
- No lenguaje técnico
- Siempre avanzar conversación

Contexto:
Intent: ${context.intent}
Stage: ${context.stage}
Strategy: ${context.strategy}

Known Data:
${JSON.stringify(context.known_data, null, 2)}

Mensaje:
${context.user_message}

Responde JSON:
{
  "reply": "mensaje",
  "confidence": 0.8
}
`;
}

async function runAI(context) {
  const prompt = buildPrompt({ context });

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  const raw = completion?.choices?.[0]?.message?.content || "";
  return normalizeAssistantOutput(raw);
}

/*
====================================================
FALLBACK (CRÍTICO)
====================================================
*/

function fallbackByStrategy(context) {
  const { intent, strategy, known_data } = context;

  if (intent === "SERVICE" || strategy === "ASK") {
    return "Con mucho gusto le ayudo 😊 ¿Me podría indicar la marca, el modelo y qué problema presenta el equipo?";
  }

  if (strategy === "QUALIFY") {
    if (!known_data.use_case) {
      return "Con mucho gusto le ayudo 😊 ¿La necesita para estudio, trabajo o algún uso específico?";
    }

    if (!known_data.budget) {
      return "Perfecto 😊 ¿Qué presupuesto aproximado tiene pensado?";
    }

    return "Perfecto 😊 ¿Hay alguna característica importante para usted?";
  }

  if (strategy === "RECOMMEND") {
    return "Perfecto 😊 Con esa información le puedo recomendar opciones. ¿Qué presupuesto maneja?";
  }

  if (strategy === "CLOSE") {
    return "Perfecto 😊 ¿Prefiere envío, entrega o retiro?";
  }

  return "Con mucho gusto le ayudo 😊 ¿En qué le puedo ayudar?";
}

/*
====================================================
MAIN
====================================================
*/

export async function handleInbound(payload) {
  try {
    const organization_id = safeString(payload?.organization_id);
    const phone = safeString(payload?.phone);
    const text = safeString(payload?.text);
    const channel = safeString(payload?.channel || "whatsapp");

    if (!organization_id || !phone || !text) {
      throw new Error("Missing inbound data");
    }

    /*
    ======================
    DB BASE
    ======================
    */

    const lead = await findOrCreateLead({ organization_id, phone });

    const conversation = await findOrCreateConversation({
      organization_id,
      phone,
      channel,
    });

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "user",
      text,
    });

    /*
    ======================
    INTENT
    ======================
    */

    const rawIntent = detectIntent(text);
    const intent = normalizeIntent(rawIntent);

    /*
    ======================
    CONTEXT BUILDER 🔥
    ======================
    */

    const context = await buildContext({
      organization_id,
      phone,
      text,
      intent,
      known_data: {}, // se mergea adentro
    });

    /*
    ======================
    STRATEGY 🔥
    ======================
    */

    const strategyDecision = decideStrategy({
      intent: context.intent,
      stage: context.stage,
      known_data: context.known_data,
    });

    const strategy = strategyDecision.strategy;

    context.strategy = strategy;

    console.log("🧠 STRATEGY FINAL:", {
      intent: context.intent,
      stage: context.stage,
      strategy,
      known_data: context.known_data,
    });

    /*
    ======================
    AI
    ======================
    */

    let reply = null;

    if (shouldUseAI({ intent })) {
      try {
        const aiResult = await runAI(context);

        if (aiResult?.reply && aiResult.confidence > 0.4) {
          reply = aiResult.reply;
        }
      } catch (e) {
        console.error("AI ERROR", e);
      }
    }

    /*
    ======================
    FALLBACK
    ======================
    */

    if (!reply) {
      reply = fallbackByStrategy(context);
    }

    reply = clampText(reply);

    /*
    ======================
    SAVE
    ======================
    */

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      text: reply,
    });

    /*
    ======================
    FOLLOWUP
    ======================
    */

    if (
      intent === "BUY" ||
      intent === "INFO" ||
      intent === "SERVICE"
    ) {
      try {
        await scheduleFollowup({
          organization_id,
          lead_id: lead?.id,
          phone,
          conversation_id: conversation.id,
        });
      } catch (e) {
        console.error("FOLLOWUP ERROR", e);
      }
    }

    return {
      reply: { text: reply },
    };
  } catch (err) {
    console.error("HANDLE ERROR", err);

    return {
      reply: {
        text: "Con mucho gusto le ayudo 😊 ¿Me puede repetir la consulta?",
      },
    };
  }
}

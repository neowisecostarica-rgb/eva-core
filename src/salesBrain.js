/*
====================================================
EVA CORE — SALES BRAIN (BLOCK 5 — FOLLOWUP READY)
====================================================
*/

import OpenAI from "openai";

import {
  findOrCreateLead,
  findOrCreateConversation,
  saveMessage,
} from "./db.js";

import { scheduleFollowup } from "./followupEngine.js"; // 🔥 IMPORT CLAVE

import { detectIntent } from "./brain/engines/intentEngine.js";
import {
  decideStrategy,
  normalizeIntent as normalizeStrategyIntent,
  normalizeStage as normalizeStrategyStage,
} from "./brain/engines/strategyEngine.js";

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
STRATEGY
====================================================
*/

function enforceStrategyRequired(strategy) {
  if (!strategy || strategy === "DEFAULT") {
    throw new Error("Strategy inválida");
  }
  return strategy;
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

function shouldUseConversationalAI({ intent }) {
  if (!openai) return false;
  if (intent === "GREETING") return false;
  return true;
}

function buildPrompt({ organization, context, userText }) {
  return `
Eres ${organization.assistant_name} de ${organization.business_name}.

OBJETIVO:
Vender ayudando al cliente.

REGLAS:
- SERVICE → diagnóstico
- NO redirigir a productos si pidió reparación
- No inventar servicios
- Máximo 1 emoji
- Siempre avanzar

Contexto:
Intent: ${context.intent}
Stage: ${context.stage}
Strategy: ${context.strategy}

Mensaje:
${userText}

Responde JSON:
{
  "reply": "mensaje",
  "confidence": 0.8
}
`;
}

async function runAI(params) {
  const prompt = buildPrompt(params);

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
🔥 RESPONSE CONTROL
====================================================
*/

function guardReply({ aiResult, stage, strategy, intent }) {
  const maxLen = stage === "EARLY" ? 260 : 420;

  let reply = clampText(aiResult?.reply || "", maxLen);
  const confidence = Number(aiResult?.confidence || 0);

  if (!reply || confidence < 0.45) return { ok: false };

  const lower = reply.toLowerCase();

  // SERVICE
  if (intent === "SERVICE") {
    return {
      ok: true,
      reply:
        "Con mucho gusto le ayudo 😊 ¿Me podría indicar la marca, el modelo y qué problema está presentando el equipo?",
    };
  }

  // EARLY
  if (stage === "EARLY") {
    return {
      ok: true,
      reply:
        "Con mucho gusto le ayudo 😊 ¿La necesita para estudio, trabajo o algún uso específico?",
    };
  }

  // FORZAR PREGUNTA
  if (
    (strategy === "ASK" || strategy === "QUALIFY") &&
    !lower.includes("¿")
  ) {
    reply += " ¿Me podría confirmar un poco más sobre lo que necesita?";
  }

  // CLOSE
  if (strategy === "CLOSE" && !lower.includes("envio")) {
    reply += " ¿Prefiere entrega, envío o retiro?";
  }

  return { ok: true, reply: clampText(reply, maxLen) };
}

/*
====================================================
MAIN
====================================================
*/

export async function handleInbound(payload) {
  try {
    const { organization_id, phone, text, channel } = payload;

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

    let intent = normalizeStrategyIntent(detectIntent(text));

    let stage = "EARLY";
    let normalizedStage = normalizeStrategyStage(stage);

    const strategyDecision = decideStrategy({
      intent,
      stage: normalizedStage,
      known_data: {},
    });

    let strategy = enforceStrategyRequired(strategyDecision?.strategy);

    if (intent === "SERVICE") strategy = "ASK";
    if (normalizedStage === "EARLY") strategy = "QUALIFY";

    console.log("🧠 FINAL STRATEGY:", { intent, stage, strategy });

    /*
    =====================
    AI
    =====================
    */

    let aiReply = null;

    if (shouldUseConversationalAI({ intent })) {
      const aiResult = await runAI({
        organization: {
          business_name: "Compu Store",
          assistant_name: "Eva",
        },
        context: { intent, stage: normalizedStage, strategy },
        userText: text,
      });

      const guarded = guardReply({
        aiResult,
        stage: normalizedStage,
        strategy,
        intent,
      });

      if (guarded.ok) aiReply = guarded.reply;
    }

    /*
    =====================
    FINAL
    =====================
    */

    let finalText = aiReply;

    if (!finalText) {
      finalText = "Con mucho gusto le ayudo 😊 ¿En qué le puedo ayudar?";
    }

    finalText = clampText(finalText);

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      text: finalText,
    });

    /*
    =====================
    🔥 FOLLOWUP
    =====================
    */

    const shouldFollowUp =
      intent === "BUY" ||
      intent === "INFO" ||
      intent === "SERVICE";

    if (shouldFollowUp) {
      try {
        await scheduleFollowup({
          organization_id,
          lead_id: lead.id,
          phone,
          delay_hours: 24,
          reason: "no_response",
        });
      } catch (e) {
        console.error("❌ FOLLOWUP ERROR:", e);
      }
    }

    return {
      reply: { text: finalText },
    };
  } catch (err) {
    console.error(err);

    return {
      reply: { text: "Error procesando mensaje" },
    };
  }
}

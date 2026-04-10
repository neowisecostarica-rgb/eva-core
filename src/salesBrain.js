/*
====================================================
EVA CORE — SALES BRAIN (BLOCK 4 — FIXED)
====================================================
*/

import OpenAI from "openai";

const openai =
  process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/*
====================================================
UTILS
====================================================
*/

function safeString(value) {
  return String(value || "").trim();
}

function clampText(text, max = 420) {
  const clean = safeString(text).replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
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
AI NORMALIZATION
====================================================
*/

function normalizeAssistantOutput(raw) {
  if (!raw) {
    return { reply: "", confidence: 0 };
  }

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

/*
====================================================
AI DECISION
====================================================
*/

function shouldUseConversationalAI({
  controlMode = "HYBRID",
  intent,
  stage,
  strategy,
  text,
}) {
  if (!openai) return false;

  if (controlMode === "SAFE") return false;

  const t = safeString(text).toLowerCase();

  if (intent === "GREETING" && t.length < 25) return false;

  if (strategy === "FOLLOWUP") return false;

  if (intent === "BUY" || intent === "INFO" || intent === "SERVICE") return true;

  if (stage === "QUALIFYING" || stage === "MID" || stage === "HOT") return true;

  return false;
}

/*
====================================================
PROMPT
====================================================
*/

function buildConversationalPrompt({
  organization,
  context,
  history,
  catalogResults,
  userText,
}) {
  return `
Eres ${organization.assistant_name} de ${organization.business_name}.

Tu objetivo es ayudar al cliente y llevar la conversación hacia una acción.

Reglas:
- Máximo 1 emoji
- No saturar
- Preguntar si falta contexto
- Cerrar conversación

Contexto:
Intent: ${context.intent}
Stage: ${context.stage}
Strategy: ${context.strategy}

Mensaje:
${userText}

Responde SOLO JSON:
{
  "reply": "mensaje"
}
`;
}

/*
====================================================
AI EXECUTION
====================================================
*/

async function runConversationalAI(params) {
  const prompt = buildConversationalPrompt(params);

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "user", content: prompt },
    ],
  });

  const raw = completion?.choices?.[0]?.message?.content || "";

  return normalizeAssistantOutput(raw);
}

/*
====================================================
GUARD
====================================================
*/

function guardConversationalReply({ aiResult, stage }) {
  const reply = clampText(aiResult.reply, stage === "EARLY" ? 260 : 420);

  if (!reply) return { ok: false };

  if (aiResult.confidence < 0.4) return { ok: false };

  return { ok: true, reply };
}

/*
====================================================
IMPORTS CORE
====================================================
*/

import db, {
  findOrCreateLead,
  findOrCreateConversation,
  saveMessage,
  updateLeadStageAndScore,
} from "./db.js";

import { detectIntent } from "./brain/engines/intentEngine.js";
import { decideStrategy } from "./brain/engines/strategyEngine.js";

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

    const intent = detectIntent(text);

    const stage = "EARLY";

    const strategy = decideStrategy({
      intent,
      stage,
      known_data: {},
    });

    const orgContext = {
      business_name: "Compu Store",
      assistant_name: "Eva",
    };

    /*
    ==========================================
    AI (BLOQUE 4 REAL)
    ==========================================
    */

    let aiReply = null;

    const useAI = shouldUseConversationalAI({
      intent,
      stage,
      strategy,
      text,
    });

    if (useAI) {
      const aiResult = await runConversationalAI({
        organization: orgContext,
        context: { intent, stage, strategy },
        history: [],
        catalogResults: [],
        userText: text,
      });

      const guarded = guardConversationalReply({
        aiResult,
        stage,
      });

      if (guarded.ok) {
        aiReply = guarded.reply;
      }
    }

    /*
    ==========================================
    FALLBACK
    ==========================================
    */

    let finalText = aiReply;

    if (!finalText) {
      finalText = "Hola 😊 ¿En qué le puedo ayudar?";
    }

    finalText = clampText(finalText);

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      text: finalText,
    });

    await updateLeadStageAndScore({
      organization_id,
      lead_id: lead.id,
      new_stage: stage,
      new_score: 50,
    });

    return {
      reply: { text: finalText },
    };
  } catch (err) {
    console.error(err);

    return {
      reply: {
        text: "Hubo un error",
      },
    };
  }
}

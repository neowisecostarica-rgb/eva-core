/*
====================================================
EVA CORE — SALES BRAIN (BLOCK 4.5 — FINAL)
====================================================
*/

import OpenAI from "openai";

import db, {
  getOrganizationSettings,
  findOrCreateLead,
  findOrCreateConversation,
  saveMessage,
  savePipelineEvent,
  updateLeadStageAndScore,
  updateLeadMemory,
} from "./db.js";

import { matchHotSignals, getHotSignals } from "./brain/utils/intentSignals.js";
import { searchCatalogSmart } from "./brain/utils/catalogEngine.js";
import { generateReply } from "./brain/replies/replyEngine.js";
import { getPromptConfig } from "./brain/utils/getPromptConfig.js";
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

function hasValue(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/*
====================================================
AI NORMALIZATION
====================================================
*/

function normalizeAssistantOutput(raw) {
  if (!raw) return { reply: "", confidence: 0 };

  if (typeof raw === "object") {
    return {
      reply: safeString(raw.reply),
      confidence: Number(raw.confidence || 0),
      intent: raw.intent || null,
      stage: raw.stage || null,
    };
  }

  const parsed = tryParseJson(raw);

  if (parsed) {
    return {
      reply: safeString(parsed.reply),
      confidence: Number(parsed.confidence || 0),
      intent: parsed.intent || null,
      stage: parsed.stage || null,
    };
  }

  return {
    reply: safeString(raw),
    confidence: 0.5,
    intent: null,
    stage: null,
  };
}

/*
====================================================
AI DECISION
====================================================
*/

function shouldUseConversationalAI({ controlMode = "HYBRID", intent }) {
  if (!openai) return false;
  if (controlMode === "SAFE") return false;

  if (intent === "GREETING") return false;

  return true;
}

/*
====================================================
PROMPT (BLINDADO)
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

OBJETIVO:
Vender ayudando al cliente.

REGLAS CRÍTICAS:
- Si el intent es SERVICE → HACER DIAGNÓSTICO
- NO redirigir a productos si pidió reparación
- No inventar servicios
- No saturar
- Máximo 1 emoji
- Siempre avanzar la conversación

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

/*
====================================================
AI EXEC
====================================================
*/

async function runConversationalAI(params) {
  const prompt = buildConversationalPrompt(params);

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
GUARD
====================================================
*/

function guardAI({ aiResult, stage }) {
  const reply = clampText(aiResult.reply, stage === "EARLY" ? 260 : 420);

  if (!reply) return { ok: false };
  if (aiResult.confidence < 0.4) return { ok: false };

  return { ok: true, reply };
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

    const intent = normalizeStrategyIntent(detectIntent(text));

    const knownData = {};

    let stage = "EARLY";
    let normalizedStage = normalizeStrategyStage(stage);

    const strategyDecision = decideStrategy({
      intent,
      stage: normalizedStage,
      known_data: knownData,
    });

    let enforcedStrategy = enforceStrategyRequired(
      strategyDecision?.strategy,
      { intent, stage: normalizedStage }
    );

    /*
    ========================================
    🔴 ENFORCEMENT CRÍTICO
    ========================================
    */

    // SERVICE → SIEMPRE diagnóstico
    if (intent === "SERVICE") {
      enforcedStrategy = "ASK";
    }

    // EARLY → SIEMPRE calificar
    if (normalizedStage === "EARLY") {
      enforcedStrategy = "QUALIFY";
    }

    console.log("🧠 FINAL STRATEGY:", {
      intent,
      stage: normalizedStage,
      strategy: enforcedStrategy,
    });

    /*
    ========================================
    AI
    ========================================
    */

    let aiReply = null;

    if (shouldUseConversationalAI({ intent })) {
      const aiResult = await runConversationalAI({
        organization: {
          business_name: "Compu Store",
          assistant_name: "Eva",
        },
        context: {
          intent,
          stage: normalizedStage,
          strategy: enforcedStrategy,
        },
        history: [],
        catalogResults: [],
        userText: text,
      });

      const guarded = guardAI({
        aiResult,
        stage: normalizedStage,
      });

      if (guarded.ok) {
        aiReply = guarded.reply;
      }
    }

    /*
    ========================================
    FINAL
    ========================================
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

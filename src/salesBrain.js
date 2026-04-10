/*
====================================================
EVA CORE — SALES BRAIN (BLOCK 4 VNEXT — FIXED)
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
BASIC UTILS
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

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/*
====================================================
AI NORMALIZATION
====================================================
*/

function normalizeAssistantOutput(raw) {
  if (!raw) {
    return {
      reply: "",
      intent: null,
      confidence: 0,
      stage: null,
      escalate_to_human: false,
      reason: "empty_ai_response",
    };
  }

  if (typeof raw === "object") {
    return {
      reply: safeString(raw.reply),
      intent: raw.intent || null,
      confidence: Number(raw.confidence || 0),
      stage: raw.stage || null,
      escalate_to_human: Boolean(raw.escalate_to_human),
      reason: raw.reason || "",
    };
  }

  const parsed = tryParseJson(raw);

  if (parsed) {
    return {
      reply: safeString(parsed.reply),
      intent: parsed.intent || null,
      confidence: Number(parsed.confidence || 0),
      stage: parsed.stage || null,
      escalate_to_human: Boolean(parsed.escalate_to_human),
      reason: parsed.reason || "",
    };
  }

  return {
    reply: safeString(raw),
    intent: null,
    confidence: 0.55,
    stage: null,
    escalate_to_human: false,
    reason: "plain_text_fallback",
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
  const mode = String(controlMode || "HYBRID").toUpperCase();

  if (mode === "SAFE") return false;
  if (!openai) return false;

  const t = safeString(text).toLowerCase();

  if (intent === "GREETING" && t.length < 25) return false;
  if (strategy === "FOLLOWUP") return false;

  if (mode === "AUTO") return true;
  if (intent === "BUY" || intent === "INFO" || intent === "SERVICE") return true;
  if (stage === "QUALIFYING" || stage === "MID" || stage === "HOT") return true;

  return false;
}

/*
====================================================
AI PROMPT
====================================================
*/

function buildConversationalPrompt({
  organization = {},
  promptConfig = {},
  context = {},
  history = [],
  catalogResults = [],
  userText = "",
}) {
  const businessName =
    organization.business_name ||
    promptConfig.business_name ||
    "el negocio";

  const assistantName =
    organization.assistant_name ||
    promptConfig.agent_name ||
    promptConfig.assistant_name ||
    "Asistente";

  const tone =
    promptConfig.tone ||
    organization.tone ||
    "respetuoso, cercano, claro y orientado a ventas";

  const objective =
    promptConfig.objective ||
    "ayudar al cliente y avanzar la conversación hacia una acción concreta";

  const language = promptConfig.language || "español";

  const knownData = context.known_data || {};
  const strategy = context.strategy || "DEFAULT";
  const intent = context.intent || "OTHER";
  const stage = context.stage || "EARLY";

  const customInstructions = safeString(promptConfig.instructions || "");

  const historyText = history
    .slice(-6)
    .map((m) => {
      const role = m.role === "assistant" ? assistantName : "Cliente";
      const content = safeString(m.content || m.text || "");
      return `${role}: ${content}`;
    })
    .join("\n");

  const catalogText =
    Array.isArray(catalogResults) && catalogResults.length > 0
      ? catalogResults
          .slice(0, 3)
          .map((p, index) => {
            const name = safeString(p.name || p.title || p.product_name);
            const price =
              p.price != null && p.price !== ""
                ? `₡${p.price}`
                : "precio no disponible";
            const description = safeString(p.description || "");
            return `${index + 1}. ${name} — ${price}${
              description ? ` — ${description}` : ""
            }`;
          })
          .join("\n")
      : "No hay productos relevantes confirmados para este mensaje.";

  return `
Eres ${assistantName}, asistente comercial con IA de ${businessName}.

OBJETIVO:
- ${objective}
- Guiar la conversación hacia una acción.
- No eres un chatbot informativo.

TONO:
- ${tone}
- Idioma: ${language}
- Máximo 1 emoji por respuesta.
- Claro, humano y breve.

REGLAS OBLIGATORIAS:
- No inventes productos, precios, inventario ni políticas.
- No expliques reparaciones paso a paso.
- No des bombazos de información.
- Primero entiende; luego explica.
- Siempre intenta avanzar la conversación.
- Si falta contexto, pregunta.
- Si ya hay contexto suficiente, recomienda o cierra.
- Si no estás segura, responde de forma conservadora y útil.

CONTEXTO:
- Intent: ${intent}
- Stage: ${stage}
- Strategy: ${strategy}
- Known data: ${JSON.stringify(knownData)}

CATÁLOGO RELEVANTE:
${catalogText}

HISTORIAL RECIENTE:
${historyText || "Sin historial reciente."}

INSTRUCCIONES PERSONALIZADAS:
${customInstructions || "Ninguna adicional."}

MENSAJE ACTUAL DEL CLIENTE:
${safeString(userText)}

Debes responder SOLO en JSON válido con esta forma:
{
  "reply": "texto para enviar al cliente",
  "intent": "BUY|INFO|SERVICE|GREETING|FOLLOWUP|OTHER",
  "confidence": 0.0,
  "stage": "EARLY|QUALIFYING|MID|HOT|POST",
  "escalate_to_human": false,
  "reason": ""
}
`.trim();
}

async function runConversationalAI({
  organization,
  promptConfig,
  context,
  history,
  catalogResults,
  userText,
}) {
  if (!openai) {
    return {
      reply: "",
      intent: null,
      confidence: 0,
      stage: null,
      escalate_to_human: false,
      reason: "openai_not_configured",
    };
  }

  const prompt = buildConversationalPrompt({
    organization,
    promptConfig,
    context,
    history,
    catalogResults,
    userText,
  });

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.35,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "Responde únicamente JSON válido.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const raw = completion?.choices?.[0]?.message?.content || "";

  return normalizeAssistantOutput(raw);
}

function guardConversationalReply({ aiResult, stage, strategy }) {
  const reply = clampText(aiResult?.reply || "", stage === "EARLY" ? 260 : 420);
  const confidence = Number(aiResult?.confidence || 0);

  if (!reply) {
    return {
      ok: false,
      reason: "empty_reply",
    };
  }

  if (confidence < 0.45) {
    return {
      ok: false,
      reason: "low_confidence",
    };
  }

  let finalReply = reply;
  const lower = finalReply.toLowerCase();

  const hasCta =
    lower.includes("¿") ||
    lower.includes("puedo ayudar") ||
    lower.includes("te gustaría") ||
    lower.includes("le gustaría") ||
    lower.includes("prefiere") ||
    lower.includes("puedo enviarle");

  if (
    !hasCta &&
    (strategy === "QUALIFY" ||
      strategy === "RECOMMEND" ||
      strategy === "CLOSE")
  ) {
    finalReply = `${finalReply} ¿Le gustaría que le ayude a elegir la opción más conveniente?`;
  }

  return {
    ok: true,
    reply: finalReply,
    confidence,
    intent: aiResult.intent || null,
    stage: aiResult.stage || null,
    escalate_to_human: Boolean(aiResult.escalate_to_human),
    reason: aiResult.reason || "",
  };
}

/*
====================================================
STRATEGY ENFORCEMENT
====================================================
*/

function enforceStrategyRequired(strategy, context = {}) {
  if (!strategy || typeof strategy !== "string" || strategy === "DEFAULT") {
    console.error("❌ INVALID STRATEGY", {
      strategy,
      context,
    });

    throw new Error("EVA no puede responder sin una strategy válida");
  }

  return strategy;
}

/*
====================================================
INTENT / DATA HELPERS
====================================================
*/

function normalizeIntent(intent) {
  if (!intent) return "OTHER";
  const clean = String(intent).toUpperCase().trim();

  if (["BUY", "PURCHASE"].includes(clean)) return "BUY";
  if (["INFO", "QUESTION"].includes(clean)) return "INFO";
  if (["SUPPORT", "HELP", "SERVICE"].includes(clean)) return "SERVICE";
  if (["GREETING", "HELLO"].includes(clean)) return "GREETING";
  if (["FOLLOWUP"].includes(clean)) return "FOLLOWUP";
  if (["CLOSE_INTENT"].includes(clean)) return "CLOSE_INTENT";
  return "OTHER";
}

function extractBudget(text = "", lead = {}) {
  if (hasValue(lead?.budget)) return lead.budget;

  const t = String(text || "").toLowerCase();

  const currencyMatch =
    t.match(/₡\s?([\d.,]+)/) ||
    t.match(/crc\s?([\d.,]+)/i) ||
    t.match(/colones?\s?([\d.,]+)/i);

  if (currencyMatch?.[1]) {
    const normalized = currencyMatch[1].replace(/[.,]/g, "");
    const parsed = Number(normalized);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }

  const bareMatch = t.match(/\b(\d{5,8})\b/);
  if (bareMatch?.[1]) {
    const parsed = Number(bareMatch[1]);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }

  return null;
}

function extractUseCase(text = "", lead = {}) {
  if (hasValue(lead?.use_case)) return lead.use_case;

  const t = String(text || "").toLowerCase();

  if (t.includes("estudio") || t.includes("colegio") || t.includes("universidad")) {
    return "estudio";
  }

  if (
    t.includes("trabajo") ||
    t.includes("oficina") ||
    t.includes("empresa") ||
    t.includes("excel")
  ) {
    return "trabajo";
  }

  if (
    t.includes("diseño") ||
    t.includes("edición") ||
    t.includes("arquitectura") ||
    t.includes("render")
  ) {
    return "creativo";
  }

  if (t.includes("gaming") || t.includes("jugar") || t.includes("juegos")) {
    return "gaming";
  }

  return null;
}

function extractProductInterest(text = "", lead = {}) {
  if (hasValue(lead?.product_interest)) return lead.product_interest;

  const t = String(text || "").toLowerCase();

  if (t.includes("laptop") || t.includes("portátil") || t.includes("portatil")) {
    return "laptop";
  }

  if (t.includes("computadora") || t.includes("pc")) {
    return "computadora";
  }

  if (t.includes("impresora")) {
    return "impresora";
  }

  if (t.includes("monitor")) {
    return "monitor";
  }

  if (t.includes("teclado numerico") || t.includes("teclado numérico")) {
    return "laptop_con_numpad";
  }

  return null;
}

function extractProblem(text = "", lead = {}) {
  if (hasValue(lead?.problem)) return lead.problem;

  const t = String(text || "").toLowerCase();

  if (
    t.includes("no sirve") ||
    t.includes("error") ||
    t.includes("mantenimiento") ||
    t.includes("repar") ||
    t.includes("no imprime") ||
    t.includes("no enciende") ||
    t.includes("falla") ||
    t.includes("lenta")
  ) {
    return text;
  }

  return null;
}

function extractBrand(text = "", lead = {}) {
  if (hasValue(lead?.brand)) return lead.brand;

  const t = String(text || "").toLowerCase();

  if (t.includes("hp")) return "HP";
  if (t.includes("epson")) return "Epson";
  if (t.includes("brother")) return "Brother";
  if (t.includes("lenovo")) return "Lenovo";
  if (t.includes("dell")) return "Dell";
  if (t.includes("asus")) return "Asus";
  if (t.includes("acer")) return "Acer";
  if (t.includes("apple") || t.includes("macbook")) return "Apple";

  return null;
}

function extractUrgency(text = "", lead = {}) {
  if (hasValue(lead?.urgency)) return lead.urgency;

  const t = String(text || "").toLowerCase();

  if (
    t.includes("hoy") ||
    t.includes("urgente") ||
    t.includes("ya") ||
    t.includes("ahora") ||
    t.includes("de una")
  ) {
    return "high";
  }

  if (t.includes("esta semana") || t.includes("pronto")) {
    return "medium";
  }

  return null;
}

function buildKnownData({ text = "", lead = {} }) {
  return {
    budget: extractBudget(text, lead),
    use_case: extractUseCase(text, lead),
    product_interest: extractProductInterest(text, lead),
    problem: extractProblem(text, lead),
    brand: extractBrand(text, lead),
    urgency: extractUrgency(text, lead),
    product_type: extractProductInterest(text, lead),
  };
}

/*
====================================================
STAGE / SCORE
====================================================
*/

function detectStage({ intent, lead = {}, text = "", knownData = {} }) {
  const t = String(text || "").toLowerCase();
  const currentStage = normalizeStrategyStage(lead?.stage || "new");
  const hotSignals = getHotSignals({});
  const hasHotSignal = matchHotSignals(t, hotSignals);

  if (
    intent === "CLOSE_INTENT" ||
    hasHotSignal ||
    t.includes("como pago") ||
    t.includes("sinpe") ||
    t.includes("transferencia") ||
    t.includes("tarjeta") ||
    t.includes("apartar") ||
    t.includes("reservar")
  ) {
    return "hot";
  }

  if (intent === "FOLLOWUP") {
    return currentStage === "new" ? "qualifying" : currentStage;
  }

  if (intent === "SERVICE") {
    if (hasValue(knownData.problem) || hasValue(knownData.brand)) {
      return "qualifying";
    }
    return currentStage === "new" ? "new" : currentStage;
  }

  if (intent === "BUY") {
    const hasCommercialData =
      hasValue(knownData.budget) ||
      hasValue(knownData.use_case) ||
      hasValue(knownData.product_interest);

    if (currentStage === "hot" || currentStage === "closing") {
      return "hot";
    }

    if (hasCommercialData) {
      return "qualifying";
    }

    return "new";
  }

  if (intent === "INFO") {
    if (currentStage === "hot") return "hot";
    return currentStage === "new" ? "qualifying" : currentStage;
  }

  if (intent === "GREETING") {
    return currentStage;
  }

  return currentStage;
}

function calculateLeadScore({ intent, stage, knownData = {}, text = "" }) {
  let score = 20;
  const t = String(text || "").toLowerCase();

  if (intent === "GREETING") score = 25;
  if (intent === "INFO") score = 40;
  if (intent === "BUY") score = 60;
  if (intent === "SERVICE") score = 55;
  if (intent === "FOLLOWUP") score = 65;
  if (intent === "CLOSE_INTENT") score = 90;

  if (hasValue(knownData.budget)) score += 10;
  if (hasValue(knownData.use_case)) score += 10;
  if (hasValue(knownData.product_interest)) score += 10;
  if (hasValue(knownData.problem)) score += 5;
  if (hasValue(knownData.urgency)) score += 5;

  if (
    t.includes("como pago") ||
    t.includes("sinpe") ||
    t.includes("transferencia") ||
    t.includes("tarjeta") ||
    t.includes("apartar") ||
    t.includes("reservar")
  ) {
    score = Math.max(score, 90);
  }

  if (stage === "hot") score = Math.max(score, 85);
  if (stage === "closing") score = Math.max(score, 90);

  return Math.min(score, 100);
}

/*
====================================================
FALLBACK
====================================================
*/

function buildFallback({ intent, strategy }) {
  if (intent === "SERVICE" && strategy === "ASK") {
    return "Hola 😊 con mucho gusto le ayudo. ¿Me podría indicar la marca, el modelo y qué problema está presentando el equipo?";
  }

  if (intent === "BUY" && strategy === "QUALIFY") {
    return "Hola 😊 con mucho gusto le ayudo. ¿La necesita para estudio, trabajo o algún uso específico?";
  }

  if (intent === "INFO") {
    return "Hola 😊 con mucho gusto le ayudo. ¿Qué información le gustaría conocer exactamente?";
  }

  if (intent === "FOLLOWUP") {
    return "Hola 😊 con mucho gusto le doy seguimiento. ¿Desea que continuemos con la opción que estaba valorando?";
  }

  if (strategy === "CLOSE") {
    return "Perfecto 😊 con mucho gusto le ayudo a coordinar el siguiente paso. ¿Prefiere entrega, envío o retiro?";
  }

  return "Hola 😊 con mucho gusto le ayudo. ¿En qué le puedo ayudar?";
}

/*
====================================================
MAIN
====================================================
*/

export async function handleInbound(payload) {
  const { context = {} } = payload;

  try {
    const { organization_id, phone, text, channel, message_id } = payload;

    let safeCatalog = [];
    let promptConfig = null;
    let orgSettings = null;

    try {
      promptConfig = await getPromptConfig(organization_id);
    } catch {}

    try {
      orgSettings = await getOrganizationSettings(organization_id);
    } catch {}

    const orgContext = {
      business_name:
        context?.organization?.business_name ||
        promptConfig?.business_name ||
        orgSettings?.business_name ||
        "el negocio",

      assistant_name:
        context?.assistant?.name ||
        promptConfig?.agent_name ||
        promptConfig?.assistant_name ||
        orgSettings?.assistant_name ||
        "Asistente",

      tone:
        context?.assistant?.tone ||
        promptConfig?.tone ||
        orgSettings?.tone ||
        "profesional",
    };

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
      message_id,
    });

    const historyRes = await db.query(
      `
      SELECT role, content AS text
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
      LIMIT 10
      `,
      [conversation.id]
    );

    const history = historyRes.rows || [];
    const t = String(text || "").toLowerCase();

    let refinedIntent = normalizeIntent(detectIntent(text));
    refinedIntent = normalizeStrategyIntent(refinedIntent);

    /*
    ============================================
    AJUSTES DE INTENT
    ============================================
    */

    if (refinedIntent === "OTHER" && history.length > 1) {
      refinedIntent = "FOLLOWUP";
    }

    if (refinedIntent === "INFO" && t.includes("precio")) {
      refinedIntent = "BUY";
    }

    if (
      t.includes("no sirve") ||
      t.includes("error") ||
      t.includes("mantenimiento") ||
      t.includes("repar")
    ) {
      refinedIntent = "SERVICE";
    }

    /*
    ============================================
    CORE FLOW
    ============================================
    */

    const knownData = buildKnownData({ text, lead });

    const stage = detectStage({
      intent: refinedIntent,
      lead,
      text,
      knownData,
    });

    let normalizedStage = normalizeStrategyStage(stage);

    const strategyDecision = decideStrategy({
      intent: refinedIntent,
      stage: normalizedStage,
      known_data: knownData,
    });

    const enforcedStrategy = enforceStrategyRequired(strategyDecision?.strategy, {
      intent: refinedIntent,
      stage: normalizedStage,
      knownData,
      strategyDecision,
    });

    const inboundContext = {
      ...context,
      intent: refinedIntent,
      stage: normalizedStage,
      known_data: knownData,
      channel,
    };

    /*
    ============================================
    CATÁLOGO
    ============================================
    */

    const shouldSearchCatalog =
      refinedIntent === "BUY" ||
      refinedIntent === "INFO" ||
      refinedIntent === "CLOSE_INTENT";

    if (shouldSearchCatalog) {
      try {
        const results = await searchCatalogSmart({
          organization_id,
          query: text,
        });

        safeCatalog = (results || []).slice(0, 3);
      } catch {}
    }

    /*
    ============================================
    AI CONVERSACIONAL REAL
    ============================================
    */

    let aiDecision = null;
    let aiReplyText = null;

    const controlMode = String(
      promptConfig?.control_mode ||
        orgSettings?.control_mode ||
        "HYBRID"
    ).toUpperCase();

    const aiContext = {
      ...inboundContext,
      intent: refinedIntent,
      stage: normalizedStage.toUpperCase(),
      strategy: enforcedStrategy,
      known_data: knownData,
    };

    const useConversationalAI = shouldUseConversationalAI({
      controlMode,
      intent: refinedIntent,
      stage: normalizedStage,
      strategy: enforcedStrategy,
      text,
    });

    if (useConversationalAI) {
      try {
        aiDecision = await runConversationalAI({
          organization: orgContext,
          promptConfig: promptConfig || {},
          context: aiContext,
          history,
          catalogResults: safeCatalog,
          userText: text,
        });

        const guardedAI = guardConversationalReply({
          aiResult: aiDecision,
          stage: normalizedStage,
          strategy: enforcedStrategy,
        });

        if (guardedAI.ok) {
          aiReplyText = guardedAI.reply;

          if (guardedAI.intent) {
            refinedIntent = normalizeStrategyIntent(
              normalizeIntent(guardedAI.intent)
            );
          }

          if (guardedAI.stage) {
            normalizedStage = normalizeStrategyStage(guardedAI.stage);
          }
        }
      } catch (aiError) {
        console.error("❌ CONVERSATIONAL AI ERROR:", aiError);
      }
    }

    /*
    ============================================
    FALLBACK / REPLY FINAL
    ============================================
    */

    let finalText = null;

    if (aiReplyText) {
      finalText = aiReplyText;
    }

    if (!finalText) {
      finalText = buildFallback({
        intent: refinedIntent,
        strategy: enforcedStrategy,
      });
    }

    finalText = clampText(
      finalText,
      normalizedStage === "EARLY" ? 260 : 420
    );

    const reply = generateReply({
      text: finalText,
      intent: refinedIntent,
      products: safeCatalog,
    });

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      text: reply.text,
    });

    /*
    ============================================
    MEMORY / STAGE / PIPELINE
    ============================================
    */

    const leadScore = calculateLeadScore({
      intent: refinedIntent,
      stage: normalizedStage,
      knownData,
      text,
    });

    try {
      await updateLeadMemory({
        organization_id,
        lead_id: lead?.id,
        memory: {
          budget: knownData.budget,
          use_case: knownData.use_case,
          product_interest: knownData.product_interest,
          problem: knownData.problem,
          brand: knownData.brand,
          urgency: knownData.urgency,
          last_intent: refinedIntent,
          last_strategy: enforcedStrategy,
          last_ai_confidence: aiDecision?.confidence || null,
        },
      });
    } catch (memoryError) {
      console.error("❌ UPDATE LEAD MEMORY ERROR:", memoryError);
    }

    try {
      await updateLeadStageAndScore({
        organization_id,
        lead_id: lead?.id,
        new_stage: normalizedStage,
        new_score: leadScore,
      });
    } catch (stageError) {
      console.error("❌ UPDATE LEAD STAGE ERROR:", stageError);
    }

    try {
      await savePipelineEvent({
        organization_id,
        lead_id: lead?.id,
        event_type: "inbound_processed",
        metadata: {
          intent: refinedIntent,
          stage: normalizedStage,
          strategy: enforcedStrategy,
          strategy_reason: strategyDecision?.reason || null,
          lead_score: leadScore,
          conversation_id: conversation.id,
          has_catalog_results: safeCatalog.length > 0,
          ai_used: Boolean(aiReplyText),
          ai_confidence: aiDecision?.confidence || null,
          ai_reason: aiDecision?.reason || null,
        },
      });
    } catch (pipelineError) {
      console.error("❌ PIPELINE EVENT ERROR:", pipelineError);
    }

    return {
      reply,
      meta: {
        intent: refinedIntent,
        stage: normalizedStage,
        strategy: enforcedStrategy,
        strategy_reason: strategyDecision?.reason || null,
        lead_score: leadScore,
        lead_id: lead?.id || null,
        conversation_id: conversation.id,
        ai_used: Boolean(aiReplyText),
        ai_confidence: aiDecision?.confidence || null,
      },
    };
  } catch (err) {
    console.error("❌ SALES BRAIN ERROR:", err);

    return {
      reply: {
        text: "Hubo un problema procesando tu solicitud.",
      },
      meta: {
        error: true,
      },
    };
  }
}

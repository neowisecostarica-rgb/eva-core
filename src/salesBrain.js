/*
====================================================
EVA CORE — SALES BRAIN (Sales Radar + Conversion vNext FIXED)
====================================================
*/

import {
  findOrCreateLead,
  findOrCreateConversation,
  saveMessage,
  savePipelineEvent,
  updateLeadStageAndScore,
  updateLeadMemory,
} from "./db.js";

import { decideStrategy } from "./brain/engines/strategyEngine.js";
import { buildContext } from "./contextBuilder.js";

import { searchCatalogSmart as searchCatalog } from "./brain/commerce/catalogEngine.js";
import { enhanceProductReply } from "./brain/commerce/productAdvisorEngine.js";

import { buildPrompt } from "./brain/utils/promptBuilder.js";
import { runAI } from "./brain/engines/aiEngine.js";
import { getPromptConfig } from "./brain/utils/getPromptConfig.js";
import { formatAIResponse } from "./brain/utils/responseFormatter.js";

/*
====================================================
UTILS
====================================================
*/

function safe(value) {
  return String(value || "").trim();
}

function clampText(text, max = 320) {
  const clean = safe(text).replace(/\s+/g, " ");
  if (!clean) return "";
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trim() + "…";
}

function hasValue(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function lowerText(value) {
  return safe(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/*
====================================================
🔥 CONVERSION ENFORCEMENT (NUEVO — CRÍTICO)
====================================================
*/

function enforceConversionRules(context, text) {
  const stage = context.stage;
  const strategy = context.strategy;
  const t = lowerText(text);

  /*
  ========================================
  EARLY → NO VENDER
  ========================================
  */
  if (stage === "EARLY") {
    if (
      t.includes("₡") ||
      t.includes("precio") ||
      t.includes("tenemos")
    ) {
      return "Con mucho gusto le ayudo 😊 ¿Para qué uso la necesita?";
    }
  }

  /*
  ========================================
  QUALIFY → SIEMPRE PREGUNTAR
  ========================================
  */
  if (strategy === "QUALIFY") {
    if (!text.includes("?")) {
      return text + " ¿Qué presupuesto tiene pensado?";
    }
  }

  /*
  ========================================
  MID → NO SATURAR
  ========================================
  */
  if (stage === "MID") {
    const lines = text.split("\n");
    if (lines.length > 3) {
      return lines[0];
    }
  }

  /*
  ========================================
  HOT → FORZAR CIERRE
  ========================================
  */
  if (stage === "HOT") {
    if (
      !t.includes("apartar") &&
      !t.includes("coordinar") &&
      !t.includes("entrega")
    ) {
      return text + " 👍 Si gusta se lo puedo dejar apartado de una vez.";
    }
  }

  return text;
}

/*
====================================================
COMMERCIAL SIGNALS
====================================================
*/

function detectCommercialSignals(text = "", context = {}) {
  const t = lowerText(text);
  const known = context?.known_data || {};
  const current = context?.current_turn_known_data || {};
  const salesContext = context?.sales_context || {};

  return {
    price_interest:
      t.includes("precio") ||
      t.includes("cuanto") ||
      t.includes("vale"),

    availability_check:
      t.includes("disponible") ||
      t.includes("tienen") ||
      t.includes("hay"),

    buy_signal:
      t.includes("quiero") ||
      t.includes("comprar") ||
      t.includes("apartar") ||
      t.includes("reservar"),

    budget_detected:
      hasValue(current?.budget) || hasValue(known?.budget),

    product_interest_detected:
      hasValue(current?.product_interest) || hasValue(known?.product_interest),

    use_case_detected:
      hasValue(current?.use_case) || hasValue(known?.use_case),

    high_intent:
      String(salesContext?.interest_level || "LOW").toUpperCase() === "HIGH" ||
      t.includes("quiero") ||
      t.includes("me interesa"),
  };
}

function calculateLeadScore(context = {}, signals = {}) {
  let score = 0;

  if (context.intent === "BUY") score += 20;
  if (signals.price_interest) score += 10;
  if (signals.availability_check) score += 10;
  if (signals.budget_detected) score += 15;
  if (signals.product_interest_detected) score += 15;
  if (signals.use_case_detected) score += 10;
  if (signals.buy_signal) score += 20;
  if (signals.high_intent) score += 20;

  return Math.min(score, 100);
}

function mapInterestLevel(score = 0) {
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

/*
====================================================
SAFE CONTEXT
====================================================
*/

function ensureContext(context = {}) {
  return {
    organization: context.organization || { id: null },
    assistant: context.assistant || { name: "Asistente" },
    intent: context.intent || "UNKNOWN",
    stage: context.stage || "EARLY",
    known_data: context.known_data || {},
    current_entities: context.current_entities || {},
    sales_context: context.sales_context || {},
    history: context.history || [],
    signals: context.signals || {},
    ...context,
  };
}

/*
====================================================
EXECUTION
====================================================
*/

async function executeStrategy(context) {
  let catalogResults = [];

  if (context.strategy === "RECOMMEND" || context.strategy === "CLOSE") {
    try {
      const products = await searchCatalog({
        organization_id: context.organization.id,
        text: context.user_message,
      });

      catalogResults = products || [];
    } catch (err) {
      console.error("❌ catalog error:", err);
    }
  }

  const promptConfig = await getPromptConfig(context.organization.id);

  const prompt = buildPrompt({
    context,
    catalogResults,
    history: context.history || [],
    promptConfig,
  });

  let aiText = null;

  try {
    const aiResult = await runAI({
      prompt: [{ role: "user", content: prompt }],
    });

    aiText = aiResult?.text || aiResult?.reply || null;
  } catch (err) {
    console.error("❌ AI ERROR:", err);
  }

  if (!aiText) {
    return {
      reply: "Con mucho gusto le ayudo 😊 ¿Me podría indicar un poco más sobre lo que necesita?",
      catalogResults,
    };
  }

  if (context.strategy === "RECOMMEND" || context.strategy === "CLOSE") {
    aiText = enhanceProductReply({
      reply: aiText,
      intent: context.intent,
      catalogMatches: catalogResults,
      data: context.sales_context,
    });
  }

  let reply = formatAIResponse({
    text: aiText,
    agentName: context.assistant.name,
  });

  /*
  ========================================
  🔥 CONVERSION ENFORCEMENT (AQUÍ VIVE EL CAMBIO)
  ========================================
  */

  reply = enforceConversionRules(context, reply);

  return {
    reply: clampText(reply),
    catalogResults,
  };
}

/*
====================================================
MAIN
====================================================
*/

export async function handleInbound(payload) {
  try {
    const organization_id = safe(payload?.organization_id);
    const phone = safe(payload?.phone);
    const text = safe(payload?.text);
    const channel = safe(payload?.channel || "whatsapp");
    const message_id = safe(payload?.message_id) || null;

    if (!organization_id || !phone || !text) {
      throw new Error("Missing inbound data");
    }

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

    let context = payload?.context;

    if (!context) {
      context = await buildContext({
        organization_id,
        phone,
        text,
      });
    }

    context = ensureContext({
      ...context,
      user_message: text,
      lead_id: lead?.id || null,
      conversation_id: conversation?.id || null,
    });

    const decision = decideStrategy({
      intent: context.intent,
      stage: context.stage,
      known_data: context.known_data,
      sales_context: context.sales_context,
      signals: context.signals,
      text,
    });

    context.intent = decision.intent;
    context.stage = decision.stage;
    context.known_data = decision.known_data;
    context.strategy = decision.strategy;
    context.current_turn_known_data = decision.current_turn_known_data;

    const signals = detectCommercialSignals(text, context);
    const score = calculateLeadScore(context, signals);
    const interest_level = mapInterestLevel(score);

    context.signals = signals;
    context.sales_context = {
      ...(context.sales_context || {}),
      interest_level,
      lead_score: score,
    };

    if (lead?.id) {
      await updateLeadStageAndScore({
        organization_id,
        lead_id: lead.id,
        new_stage: context.stage.toLowerCase(),
        new_score: score,
      });

      await updateLeadMemory({
        organization_id,
        lead_id: lead.id,
        memory: {
          budget: context.current_turn_known_data?.budget,
          use_case: context.current_turn_known_data?.use_case,
          product_interest: context.current_turn_known_data?.product_interest,
          interest_level,
          last_intent: context.intent,
        },
      });
    }

    const execution = await executeStrategy(context);
    const finalReply = clampText(execution?.reply);

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      text: finalReply,
    });

    return {
      reply: { text: finalReply },
      meta: {
        intent: context.intent,
        stage: context.stage,
        strategy: context.strategy,
        score,
        interest_level,
      },
    };

  } catch (err) {
    console.error("❌ HANDLE INBOUND ERROR:", err);

    return {
      reply: {
        text: "Con mucho gusto le ayudo 😊 ¿Me podría repetir su consulta?",
      },
    };
  }
}

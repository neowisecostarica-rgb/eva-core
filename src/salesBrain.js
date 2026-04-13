/*
====================================================
EVA CORE — SALES BRAIN (Sales Radar + Conversion vNext)
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

function detectCommercialSignals(text = "", context = {}) {
  const t = lowerText(text);
  const known = context?.known_data || {};
  const current = context?.current_turn_known_data || {};
  const salesContext = context?.sales_context || {};

  return {
    price_interest:
      t.includes("precio") ||
      t.includes("cuanto") ||
      t.includes("cuánto") ||
      t.includes("vale"),

    availability_check:
      t.includes("disponible") ||
      t.includes("tienen") ||
      t.includes("hay") ||
      t.includes("stock"),

    buy_signal:
      t.includes("quiero") ||
      t.includes("comprar") ||
      t.includes("apartar") ||
      t.includes("reservar") ||
      t.includes("como pago") ||
      t.includes("cómo pago") ||
      t.includes("sinpe") ||
      t.includes("tarjeta") ||
      t.includes("transferencia"),

    budget_detected:
      hasValue(current?.budget) || hasValue(known?.budget),

    product_interest_detected:
      hasValue(current?.product_interest) || hasValue(known?.product_interest),

    use_case_detected:
      hasValue(current?.use_case) || hasValue(known?.use_case),

    high_intent:
      String(salesContext?.interest_level || "LOW").toUpperCase() === "HIGH" ||
      t.includes("quiero") ||
      t.includes("me interesa") ||
      t.includes("apartar") ||
      t.includes("reservar"),
  };
}

function calculateLeadScore(context = {}, signals = {}) {
  let score = 0;

  if (context.intent === "BUY") score += 20;
  if (context.intent === "CLOSE_INTENT") score += 40;
  if (signals.price_interest) score += 10;
  if (signals.availability_check) score += 10;
  if (signals.budget_detected) score += 15;
  if (signals.product_interest_detected) score += 15;
  if (signals.use_case_detected) score += 10;
  if (signals.buy_signal) score += 20;
  if (signals.high_intent) score += 20;
  if (context.stage === "HOT") score += 20;
  if (context.stage === "MID") score += 10;

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
    organization: context.organization || { id: null, business_name: "el negocio" },
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
FALLBACK REPLY
====================================================
*/

function buildFallbackReply(context) {
  const { strategy } = context;

  if (strategy === "QUALIFY") {
    return "Con mucho gusto le ayudo 😊 ¿Para qué uso la necesita?";
  }

  if (strategy === "RECOMMEND") {
    return "Le puedo recomendar una opción que se ajuste a lo que busca 👍 ¿Qué presupuesto tiene pensado?";
  }

  if (strategy === "CLOSE") {
    return "Si gusta se lo puedo dejar apartado de una vez y coordinamos entrega 👍";
  }

  if (strategy === "EXPLAIN_CLOSE") {
    return "Con mucho gusto le ayudo. Para orientarle bien, ¿me podría indicar la marca, el modelo y qué problema presenta el equipo?";
  }

  return "Con mucho gusto le ayudo 😊 ¿Me podría indicar un poco más sobre lo que necesita?";
}

/*
====================================================
PIPELINE EVENTS
====================================================
*/

async function registerCommercialEvents({
  organization_id,
  lead_id,
  context,
  text,
  signals,
}) {
  try {
    await savePipelineEvent({
      organization_id,
      lead_id,
      event_type: "intent_detected",
      metadata: {
        intent: context.intent,
        stage: context.stage,
        strategy: context.strategy,
      },
    });

    await savePipelineEvent({
      organization_id,
      lead_id,
      event_type: "stage_updated",
      metadata: {
        stage: context.stage,
      },
    });

    if (signals.price_interest) {
      await savePipelineEvent({
        organization_id,
        lead_id,
        event_type: "price_interest",
        metadata: { text },
      });
    }

    if (signals.high_intent) {
      await savePipelineEvent({
        organization_id,
        lead_id,
        event_type: "high_intent",
        metadata: { text },
      });
    }

    if (signals.availability_check) {
      await savePipelineEvent({
        organization_id,
        lead_id,
        event_type: "availability_check",
        metadata: { text },
      });
    }

    if (signals.budget_detected) {
      await savePipelineEvent({
        organization_id,
        lead_id,
        event_type: "budget_detected",
        metadata: {
          budget:
            context?.current_turn_known_data?.budget ??
            context?.known_data?.budget ??
            null,
        },
      });
    }

    if (signals.product_interest_detected) {
      await savePipelineEvent({
        organization_id,
        lead_id,
        event_type: "product_interest_detected",
        metadata: {
          product_interest:
            context?.current_turn_known_data?.product_interest ??
            context?.known_data?.product_interest ??
            null,
        },
      });
    }

    if (signals.use_case_detected) {
      await savePipelineEvent({
        organization_id,
        lead_id,
        event_type: "use_case_detected",
        metadata: {
          use_case:
            context?.current_turn_known_data?.use_case ??
            context?.known_data?.use_case ??
            null,
        },
      });
    }
  } catch (err) {
    console.error("❌ PIPELINE EVENT ERROR:", err);
  }
}

/*
====================================================
EXECUTION
====================================================
*/

async function executeStrategy(context) {
  console.log("⚙️ EXECUTION INPUT", {
    intent: context.intent,
    stage: context.stage,
    strategy: context.strategy,
    known_data: context.known_data,
  });

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

    aiText =
      aiResult?.text ||
      aiResult?.reply ||
      aiResult?.content ||
      null;
  } catch (err) {
    console.error("❌ AI ERROR:", err);
  }

  if (!aiText) {
    return {
      reply: buildFallbackReply(context),
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

  const formatted = formatAIResponse({
    text: aiText,
    agentName: context.assistant.name,
  });

  return {
    reply: clampText(formatted),
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

    console.log("📥 INBOUND RAW", { phone, text });

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

    /*
    ========================================
    CONTEXT
    ========================================
    */

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

    /*
    ========================================
    STRATEGY ENGINE
    ========================================
    */

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
    context.strategy_reason = decision.reason;
    context.current_turn_known_data = decision.current_turn_known_data;

    /*
    ========================================
    SALES RADAR SIGNALS
    ========================================
    */

    const signals = detectCommercialSignals(text, context);
    const score = calculateLeadScore(context, signals);
    const interest_level = mapInterestLevel(score);

    context.signals = signals;
    context.sales_context = {
      ...(context.sales_context || {}),
      interest_level,
      lead_score: score,
    };

    console.log("🧠 FINAL DECISION", {
      intent: context.intent,
      stage: context.stage,
      strategy: context.strategy,
      score,
      interest_level,
      signals,
    });

    /*
    ========================================
    PERSIST MEMORY
    ========================================
    */

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
          budget:
            context?.current_turn_known_data?.budget ??
            context?.known_data?.budget ??
            null,
          use_case:
            context?.current_turn_known_data?.use_case ??
            context?.known_data?.use_case ??
            null,
          product_interest:
            context?.current_turn_known_data?.product_interest ??
            context?.known_data?.product_interest ??
            null,
          interest_level,
          last_intent: context.intent,
        },
      });

      await registerCommercialEvents({
        organization_id,
        lead_id: lead.id,
        context,
        text,
        signals,
      });
    }

    /*
    ========================================
    EXECUTION
    ========================================
    */

    const execution = await executeStrategy(context);
    const finalReply = clampText(execution?.reply);

    /*
    ========================================
    SAVE ASSISTANT MESSAGE
    ========================================
    */

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
        text: "Con mucho gusto le ayudo 😊 ¿Me podría repetir su consulta, por favor?",
      },
    };
  }
}

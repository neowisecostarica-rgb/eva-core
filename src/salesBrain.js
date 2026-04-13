/*
====================================================
EVA CORE — SALES BRAIN (vNext — PRODUCTION SAFE)
====================================================
*/

import {
  findOrCreateLead,
  findOrCreateConversation,
  saveMessage,
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

/*
====================================================
SAFE CONTEXT (CRÍTICO)
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
FALLBACK INTELIGENTE (CRÍTICO)
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

  return "Con mucho gusto le ayudo 😊 ¿Me podría indicar un poco más sobre lo que necesita?";
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

  /*
  ========================================
  🔥 FALLBACK INTELIGENTE
  ========================================
  */

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
    CONTEXT (FIX)
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

    console.log("🧠 FINAL DECISION", {
      intent: context.intent,
      stage: context.stage,
      strategy: context.strategy,
    });

    /*
    ========================================
    EXECUTION
    ========================================
    */

    const execution = await executeStrategy(context);

    const finalReply = clampText(execution?.reply);

    /*
    ========================================
    SAVE
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

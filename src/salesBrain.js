/*
====================================================
EVA CORE — SALES BRAIN (FIXED — RESPONSE INTELLIGENCE)
====================================================
*/

import {
  findOrCreateLead,
  findOrCreateConversation,
  saveMessage,
} from "./db.js";

import { scheduleFollowup } from "./followupEngine.js";

import {
  decideStrategy,
} from "./brain/engines/strategyEngine.js";

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
STAGE GUARD (FIX CRÍTICO)
====================================================
*/

function enforceStageFromMessage({ text, intent }) {
  const t = text.toLowerCase();

  // 🔒 GREETING nunca puede ser HOT
  if (intent === "GREETING") return "EARLY";

  // 🔒 Mensajes cortos / exploratorios
  if (t.length < 20) return "EARLY";

  // 🔒 Búsqueda básica
  if (t.includes("busco") || t.includes("información")) {
    return "QUALIFYING";
  }

  // 🔥 Señales reales de cierre
  if (
    t.includes("comprar") ||
    t.includes("apartar") ||
    t.includes("pagar") ||
    t.includes("lo quiero")
  ) {
    return "HOT";
  }

  return null; // no forzar
}

/*
====================================================
KNOWN DATA MERGE (FIX CRÍTICO)
====================================================
*/

function mergeKnownData(memory = {}, current = {}) {
  return {
    ...memory,
    ...current, // 🔥 el turno actual manda
  };
}

/*
====================================================
STRATEGY GUARD (FIX CRÍTICO)
====================================================
*/

function enforceStrategy({ strategy, intent, stage, text }) {
  const t = text.toLowerCase();

  // 🔒 Nunca cerrar sin señal fuerte
  if (strategy === "CLOSE") {
    const hasCloseSignal =
      t.includes("comprar") ||
      t.includes("apartar") ||
      t.includes("pagar");

    if (!hasCloseSignal) {
      return "RECOMMEND";
    }
  }

  // 🔒 GREETING nunca cierra
  if (intent === "GREETING") {
    return "ASK";
  }

  return strategy;
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

  console.log("🤖 PROMPT PREVIEW", prompt.slice(0, 300));

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

    const context = await buildContext({
      organization_id,
      phone,
      text,
    });

    /*
    ========================================
    🔥 FIX 1 — STAGE PRIORITY
    ========================================
    */

    const forcedStage = enforceStageFromMessage({
      text,
      intent: context.intent,
    });

    if (forcedStage) {
      context.stage = forcedStage;
    }

    /*
    ========================================
    🔥 FIX 2 — KNOWN DATA PRIORITY
    ========================================
    */

    context.known_data = mergeKnownData(
      context.known_data || {},
      context.current_entities || {}
    );

    /*
    ========================================
    STRATEGY
    ========================================
    */

    const strategyDecision = decideStrategy({
      intent: context.intent,
      stage: context.stage,
      known_data: context.known_data,
      sales_context: context.sales_context,
      signals: context.signals,
    });

    /*
    ========================================
    🔥 FIX 3 — STRATEGY GUARD
    ========================================
    */

    context.strategy = enforceStrategy({
      strategy: strategyDecision.strategy,
      intent: context.intent,
      stage: context.stage,
      text,
    });

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

    let finalReply = clampText(
      execution?.reply ||
        "Con mucho gusto le ayudo 😊 ¿Me podría indicar un poco más sobre lo que necesita?"
    );

    console.log("🧾 FINAL OUTPUT", {
      reply: finalReply,
      strategy: context.strategy,
    });

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

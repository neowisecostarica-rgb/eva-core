/*
====================================================
EVA CORE — SALES BRAIN (BLOCK 3 — STRATEGY ENFORCED)
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
  normalizeIntent,
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
AI CONTROL (BLOCK 4)
====================================================
*/

function shouldUseAI(context, catalogResults = []) {
  if (!context?.strategy) return false;

  if (context.strategy === "ASK") return false;

  if (
    context.strategy === "QUALIFY" &&
    !context.known_data?.use_case &&
    !context.known_data?.budget
  ) {
    return false;
  }

  if (
    (context.strategy === "RECOMMEND" ||
      context.strategy === "CLOSE") &&
    catalogResults.length === 0
  ) {
    return false;
  }

  return true;
}

function validateAIReply(reply, context, catalogResults = []) {
  const text = String(reply || "").toLowerCase();

  if (
    (context.strategy === "RECOMMEND" ||
      context.strategy === "CLOSE") &&
    catalogResults.length === 0
  ) {
    return false;
  }

  if (
    catalogResults.length === 0 &&
    (text.includes("₡") || text.includes("precio"))
  ) {
    return false;
  }

  return true;
}

function buildSafeFallback(context) {
  if (context.strategy === "QUALIFY") {
    return "Con mucho gusto le ayudo 😊 ¿La necesita para estudio, trabajo o algún uso específico?";
  }

  if (context.strategy === "ASK") {
    return "Con mucho gusto le ayudo 😊 ¿Me podría indicar un poco más sobre lo que necesita?";
  }

  if (context.strategy === "RECOMMEND") {
    return "Perfecto 😊 Para recomendarle mejor, ¿qué uso le piensa dar y qué presupuesto tiene?";
  }

  if (context.strategy === "CLOSE") {
    return "Perfecto 😊 Le ayudo a avanzar con la compra. ¿Prefiere envío, entrega o retiro?";
  }

  return "Con mucho gusto le ayudo 😊 ¿En qué le puedo ayudar?";
}

/*
====================================================
🔥 STRATEGY ENFORCEMENT
====================================================
*/

function enforceStrategyPre(context) {
  if (!context?.strategy) {
    throw new Error("Strategy is required");
  }

  // 🔴 Si intenta recomendar sin intención clara → volver a QUALIFY
  if (
    (context.strategy === "RECOMMEND" ||
      context.strategy === "CLOSE") &&
    !context.known_data?.product_interest
  ) {
    context.strategy = "QUALIFY";
  }

  return context;
}

function enforceStrategyPost(reply, context) {
  const text = String(reply || "").toLowerCase();

  /*
  ========================================
  QUALIFY / ASK
  ========================================
  */

  if (
    context.strategy === "QUALIFY" ||
    context.strategy === "ASK"
  ) {
    // ❌ evitar venta prematura
    if (
      text.includes("₡") ||
      text.includes("precio") ||
      text.includes("recomiendo")
    ) {
      return "Con mucho gusto le ayudo 😊 ¿Me podría indicar un poco más sobre lo que necesita?";
    }

    // ✅ asegurar pregunta
    if (!reply.includes("¿")) {
      return reply + " ¿Me podría confirmar un poco más sobre lo que necesita?";
    }
  }

  /*
  ========================================
  CLOSE
  ========================================
  */

  if (context.strategy === "CLOSE") {
    if (
      !text.includes("envío") &&
      !text.includes("retiro") &&
      !text.includes("entrega")
    ) {
      return reply + " ¿Prefiere envío, entrega o retiro?";
    }
  }

  return reply;
}

/*
====================================================
STRATEGY EXECUTION
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

// 🔥 AI GATE (ANTES)
if (!shouldUseAI(context, catalogResults)) {
  return {
    reply: buildSafeFallback(context),
    catalogResults,
  };
}

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

// 🔥 VALIDACIÓN (DESPUÉS)
if (!aiText || !validateAIReply(aiText, context, catalogResults)) {
  return {
    reply: buildSafeFallback(context),
    catalogResults,
  };
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
    CONTEXT (SOT)
    ========================================
    */

    const context =
  payload.context ||
  (await buildContext({
    organization_id,
    phone,
    text,
  }));

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

    context.strategy = strategyDecision.strategy;

    // 🔥 PRE ENFORCEMENT
    enforceStrategyPre(context);

    console.log("🧠 STRATEGY", {
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

    // 🔥 POST ENFORCEMENT
    finalReply = enforceStrategyPost(finalReply, context);

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

    /*
    ========================================
    FOLLOWUP
    ========================================
    */

    if (
      context.intent === "BUY" ||
      context.intent === "INFO" ||
      context.intent === "SERVICE"
    ) {
      try {
        await scheduleFollowup({
          organization_id,
          lead_id: lead?.id || null,
          phone,
          conversation_id: conversation.id,
          delay_hours: 24,
          reason: "sales_followup",
        });
      } catch (err) {
        console.error("❌ followup error:", err);
      }
    }

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

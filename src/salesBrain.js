/*
====================================================
EVA CORE — SALES BRAIN (ENFORCEMENT FIXED vNEXT)
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

import { createFollowupsForConversation } from "./followupEngine.js";

/*
====================================================
UTILS
====================================================
*/

function safe(v) {
  return String(v || "").trim();
}

function lowerText(v) {
  return safe(v)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/*
====================================================
🔥 ENFORCEMENT LAYER (CRÍTICO)
====================================================
*/

function enforceStrategyResponse({ strategy, text, context }) {
  if (!text) return text;

  const lower = lowerText(text);

  // 🔥 ASK / QUALIFY → debe preguntar
  if (strategy === "ASK" || strategy === "QUALIFY") {
    if (!text.includes("?")) {
      return text + " ¿Me podría indicar un poco más para ayudarle mejor?";
    }
  }

  // 🔥 CLOSE → debe empujar acción
  if (strategy === "CLOSE") {
    if (
      !lower.includes("coordinar") &&
      !lower.includes("apartar") &&
      !lower.includes("envio")
    ) {
      return text + " Si gusta, podemos coordinar la entrega o dejarla apartada 😊";
    }
  }

  return text;
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
      catalogResults =
        (await searchCatalog({
          organization_id: context.organization.id,
          text: context.user_message,
        })) || [];
    } catch {}
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
    const ai = await runAI({
      prompt: [{ role: "user", content: prompt }],
    });
    aiText = ai?.text || null;
  } catch {}

  /*
  ========================================
  🔥 FALLBACK POR STRATEGY
  ========================================
  */

  if (!aiText) {
    if (context.strategy === "ASK" || context.strategy === "QUALIFY") {
      return {
        reply:
          "Con mucho gusto le ayudo 😊 ¿Me podría indicar un poco más sobre lo que necesita?",
      };
    }

    if (context.strategy === "CLOSE") {
      return {
        reply:
          "Perfecto 😊 Si gusta, podemos coordinar la entrega o dejarlo apartado.",
      };
    }

    return {
      reply:
        "Con mucho gusto le ayudo 😊 ¿En qué le puedo ayudar?",
    };
  }

  /*
  ========================================
  🔥 PRODUCT ENHANCEMENT
  ========================================
  */

  const isProductQuery =
    context.intent === "BUY" ||
    context.intent === "CLOSE_INTENT";

  if (
    (context.strategy === "RECOMMEND" || context.strategy === "CLOSE") &&
    isProductQuery
  ) {
    aiText = enhanceProductReply({
      reply: aiText,
      intent: context.intent,
      catalogMatches: catalogResults,
      data: context.sales_context,
    });
  }

  /*
  ========================================
  🔥 FORMAT
  ========================================
  */

  let formatted = formatAIResponse({
    text: aiText,
    agentName: context.assistant.name,
  });

  /*
  ========================================
  🔥 ENFORCEMENT FINAL
  ========================================
  */

  formatted = enforceStrategyResponse({
    strategy: context.strategy,
    text: formatted,
    context,
  });

  return {
    reply: formatted,
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
    const message_id = payload?.message_id || null;

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

    let context =
      payload?.context ||
      (await buildContext({ organization_id, phone, text }));

    context = {
      ...context,
      user_message: text,
      phone,
    };

    /*
    ========================================
    STRATEGY (MANDATORY)
    ========================================
    */

    const decision = decideStrategy({
      intent: context.intent,
      stage: context.stage,
      known_data: context.known_data,
      text,
    });

    context = { ...context, ...decision };

    /*
    ========================================
    EXECUTION
    ========================================
    */

    const execution = await executeStrategy(context);

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      text: execution.reply,
    });

    await updateLeadStageAndScore({
      organization_id,
      phone,
      stage: context.stage,
      score: context?.sales_context?.lead_score || 0,
    });

    await updateLeadMemory({
      organization_id,
      phone,
      data: context.known_data,
    });

    await createFollowupsForConversation({
      organization_id,
      conversation_id: conversation.id,
      phone,
      context,
    });

    await savePipelineEvent({
      organization_id,
      conversation_id: conversation.id,
      lead_phone: phone,
      event_type: "MESSAGE_PROCESSED",
      event_data: {
        user_input: text,
        reply: execution.reply,
        intent: context.intent,
        stage: context.stage,
        strategy: context.strategy,
      },
    });

    return {
      reply: { text: execution.reply },
    };

  } catch (err) {
    console.error(err);

    return {
      reply: {
        text:
          "Con mucho gusto le ayudo 😊 ¿Me podría repetir su consulta?",
      },
    };
  }
}

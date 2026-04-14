/*
====================================================
EVA CORE — SALES BRAIN (RUNTIME FIXED + REENTRY)
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
🔥 ACTIONS
====================================================
*/

async function registerActions({
  organization_id,
  conversation_id,
  phone,
  context,
  text,
}) {
  try {
    const t = lowerText(text);

    const signals = {
      price_interest: t.includes("precio") || t.includes("cuanto"),
      buy_signal: t.includes("quiero") || t.includes("comprar"),
      availability: t.includes("disponible") || t.includes("tienen"),
    };

    if (
      context.stage === "HOT" ||
      context.strategy === "CLOSE" ||
      signals.buy_signal
    ) {
      await savePipelineEvent({
        organization_id,
        conversation_id,
        lead_phone: phone,
        event_type: "HOT_LEAD_DETECTED",
        event_data: {
          intent: context.intent,
          stage: context.stage,
          strategy: context.strategy,
          score: context?.sales_context?.lead_score,
        },
      });
    }

    if (signals.price_interest) {
      await savePipelineEvent({
        organization_id,
        conversation_id,
        lead_phone: phone,
        event_type: "PRICE_INTEREST",
        event_data: {
          intent: context.intent,
          stage: context.stage,
        },
      });
    }

    if (signals.availability) {
      await savePipelineEvent({
        organization_id,
        conversation_id,
        lead_phone: phone,
        event_type: "AVAILABILITY_CHECK",
        event_data: {
          intent: context.intent,
          stage: context.stage,
        },
      });
    }

  } catch (err) {
    console.error("registerActions error", err.message);
  }
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
    aiText = ai?.text || ai?.reply || null;
  } catch {}

  if (!aiText) {
    return {
      reply:
        "Con mucho gusto le ayudo 😊 ¿Me podría indicar un poco más sobre lo que necesita?",
    };
  }

  // 🔥 CONTROL INTELIGENTE DE PRODUCTOS

const isProductQuery =
  context.intent === "BUY" ||
  context.intent === "CLOSE_INTENT";

const isInfoQuery =
  context.intent === "INFO" &&
  (lowerText(context.user_message).includes("laptop") ||
    lowerText(context.user_message).includes("computadora") ||
    lowerText(context.user_message).includes("dell") ||
    lowerText(context.user_message).includes("lenovo"));

if (
  (context.strategy === "RECOMMEND" || context.strategy === "CLOSE") &&
  (isProductQuery || isInfoQuery)
) {
  aiText = enhanceProductReply({
    reply: aiText,
    intent: context.intent,
    catalogMatches: catalogResults,
    data: context.sales_context,
  });
}
  

  return {
    reply: formatAIResponse({
      text: aiText,
      agentName: context.assistant.name,
    }),
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

    // 🔥 guardar inbound (idempotencia real)
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
    🔥 CONTROL DE REENTRY (UNIFICADO)
    ========================================
    */

    if (context.meta?.is_reentry) {
      if (context.stage === "EARLY") {
        context.stage = "MID";
      }

      context.reentry_mode = true;
    }

    /*
    ========================================
    STRATEGY
    ========================================
    */

    const decision = decideStrategy({
      intent: context.intent,
      stage: context.stage,
      known_data: context.known_data,
      text,
    });

    context = { ...context, ...decision };

    const execution = await executeStrategy(context);

    /*
    ========================================
    SAVE RESPONSE
    ========================================
    */

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      text: execution.reply,
    });

    /*
    ========================================
    🔥 PERSISTENCIA CRM
    ========================================
    */

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

    /*
    ========================================
    FOLLOWUPS
    ========================================
    */

    await createFollowupsForConversation({
      organization_id,
      conversation_id: conversation.id,
      phone,
      context,
    });

    /*
    ========================================
    ACTIONS
    ========================================
    */

    await registerActions({
      organization_id,
      conversation_id: conversation.id,
      phone,
      context,
      text,
    });

    /*
    ========================================
    LOG
    ========================================
    */

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

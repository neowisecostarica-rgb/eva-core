/*
====================================================
EVA CORE — SALES BRAIN (ENFORCEMENT SAFE vNEXT)
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
🔥 DETECTORES CLAVE (NUEVO)
====================================================
*/

function isTransactionalQuery(text = "") {
  const t = lowerText(text);

  return (
    t.includes("pago") ||
    t.includes("sinpe") ||
    t.includes("tarjeta") ||
    t.includes("transferencia") ||
    t.includes("envio") ||
    t.includes("envío") ||
    t.includes("ubicacion") ||
    t.includes("direccion") ||
    t.includes("donde estan") ||
    t.includes("donde se ubican")
  );
}

function isProductIntent(context = {}) {
  return (
    context.intent === "BUY" ||
    context.intent === "CLOSE_INTENT"
  );
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
  FALLBACK INTELIGENTE
  ========================================
  */

  if (!aiText) {
    return {
      reply:
        "Con mucho gusto le ayudo 😊 ¿Me podría indicar un poco más sobre lo que necesita?",
    };
  }

  /*
  ========================================
  🔥 FIX CRÍTICO — CONTROL DE PRODUCTOS
  ========================================
  */

  const transactional = isTransactionalQuery(context.user_message);

  const shouldEnhanceProducts =
    !transactional &&
    (context.strategy === "RECOMMEND" || context.strategy === "CLOSE") &&
    isProductIntent(context);

  if (shouldEnhanceProducts) {
    try {
      aiText = enhanceProductReply({
        reply: aiText,
        intent: context.intent,
        catalogMatches: catalogResults,
        data: context.sales_context,
      });
    } catch (err) {
      console.error("enhanceProductReply error", err.message);
    }
  }

  /*
  ========================================
  FORMAT FINAL
  ========================================
  */

  const formatted = formatAIResponse({
    text: aiText,
    agentName: context.assistant.name,
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

    /*
    ========================================
    EXECUTION
    ========================================
    */

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
    CRM
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

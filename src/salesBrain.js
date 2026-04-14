/*
====================================================
EVA CORE — SALES BRAIN (ENFORCEMENT SAFE vNEXT.2)
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
DETECTORES CLAVE
====================================================
*/

function isTransactionalQuery(text = "") {
  const t = lowerText(text);

  return (
    t.includes("pago") ||
    t.includes("sinpe") ||
    t.includes("tarjeta") ||
    t.includes("transferencia") ||
    t.includes("deposito") ||
    t.includes("depósito") ||
    t.includes("cuenta") ||
    t.includes("iban") ||
    t.includes("envio") ||
    t.includes("envíos") ||
    t.includes("envío") ||
    t.includes("ubicacion") ||
    t.includes("ubicación") ||
    t.includes("direccion") ||
    t.includes("dirección") ||
    t.includes("donde estan") ||
    t.includes("donde están") ||
    t.includes("donde se ubican") ||
    t.includes("dónde se ubican") ||
    t.includes("horario") ||
    t.includes("garantia") ||
    t.includes("garantía")
  );
}

function isProductIntent(context = {}) {
  return context.intent === "BUY" || context.intent === "CLOSE_INTENT";
}

/*
====================================================
AI PRODUCT MENTION DETECTOR
====================================================
Si la AI ya recomendó un producto concreto, NO debemos
reemplazarlo con enhanceProductReply.
====================================================
*/

function aiAlreadyMentionedConcreteProduct(text = "") {
  const t = safe(text);

  if (!t) return false;

  const lower = lowerText(t);

  const productSignals = [
    "lenovo",
    "dell",
    "hp",
    "thinkpad",
    "latitude",
    "probook",
    "elitebook",
    "yoga",
    "monitor",
    "impresora",
  ];

  const specSignals = [
    "i3",
    "i5",
    "i7",
    "ryzen",
    "8gb",
    "16gb",
    "32gb",
    "ssd",
    "ram",
    "full hd",
    "tactil",
    "táctil",
  ];

  const hasProductWord = productSignals.some((signal) => lower.includes(signal));
  const hasSpecWord = specSignals.some((signal) => lower.includes(signal));
  const hasPrice = /₡\s?\d|crc\s?\d|\b\d{5,7}\b/.test(t);

  return hasProductWord && (hasSpecWord || hasPrice);
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
    } catch (err) {
      console.error("searchCatalog error", err.message);
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
    const ai = await runAI({
      prompt: [{ role: "user", content: prompt }],
    });
    aiText = ai?.text || null;
  } catch (err) {
    console.error("runAI error", err.message);
  }

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
  FIX CRÍTICO — CONTROL DE PRODUCTOS
  ========================================
  */

  const transactional = isTransactionalQuery(context.user_message);
  const aiMentionedConcreteProduct = aiAlreadyMentionedConcreteProduct(aiText);

  const shouldEnhanceProducts =
    !transactional &&
    !aiMentionedConcreteProduct &&
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

    await findOrCreateLead({ organization_id, phone });

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
        text: "Con mucho gusto le ayudo 😊 ¿Me podría repetir su consulta?",
      },
    };
  }
}

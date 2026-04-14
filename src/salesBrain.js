/*
====================================================
EVA CORE — SALES BRAIN (TRACE + FACT ROUTER vNEXT.4)
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

import { buildPrompt } from "./brain/utils/promptBuilder.js";
import { runAI } from "./brain/engines/aiEngine.js";
import { getPromptConfig } from "./brain/utils/getPromptConfig.js";
import { formatAIResponse } from "./brain/utils/responseFormatter.js";

import { createFollowupsForConversation } from "./followupEngine.js";

/*
====================================================
FACT ROUTER (NO AI)
====================================================
*/

function resolveBusinessQuery(text = "", context = {}) {
  const t = String(text).toLowerCase();

  const bc = context.business_context || {};

  // ENVÍOS
  if (t.includes("envio")) {
    if (bc?.operations?.delivery === true) {
      return "Sí, realizamos envíos 🚚 El costo varía según la zona, con gusto te cotizo. ¿En qué ubicación te encuentras?";
    }
    if (bc?.operations?.delivery === false) {
      return "En este momento no realizamos envíos, pero puedes retirar directamente en tienda 😊";
    }
  }

  // SINPE
  if (t.includes("sinpe")) {
    if (bc?.payments?.sinpe) {
      return `Sí, puedes pagar por SINPE al ${bc.payments.sinpe} 👍`;
    }
  }

  // UBICACIÓN
  if (t.includes("donde") || t.includes("ubicacion")) {
    if (bc?.location?.address) {
      return `Estamos ubicados en ${bc.location.address} 📍`;
    }
  }

  return null;
}

/*
====================================================
AI EXECUTION
====================================================
*/

async function executeAI(context) {
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

  console.log("🧠 TRACE — PROMPT PREVIEW", prompt.slice(0, 500));

  let aiText = null;

  try {
    const ai = await runAI({
      prompt: [{ role: "user", content: prompt }],
    });
    aiText = ai?.text || null;
  } catch (err) {
    console.error("runAI error", err.message);
  }

  console.log("🧠 TRACE — AI RAW TEXT", aiText);

  if (!aiText) {
    return {
      reply:
        "Con mucho gusto le ayudo 😊 ¿Me podría indicar un poco más sobre lo que necesita?",
    };
  }

  const formatted = formatAIResponse({
    text: aiText,
    agentName: context.assistant.name,
  });

  console.log("🧠 TRACE — FINAL REPLY", formatted);

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
    const organization_id = payload?.organization_id;
    const phone = payload?.phone;
    const text = payload?.text;
    const channel = payload?.channel || "whatsapp";
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

    console.log("🧠 TRACE — CONTEXT", {
      intent: context.intent,
      stage: context.stage,
      known_data: context.known_data,
      business: {
        sinpe: context.business_context?.payments?.sinpe,
        delivery: context.business_context?.operations?.delivery,
        address: context.business_context?.location?.address,
      },
    });

    const decision = decideStrategy({
      intent: context.intent,
      stage: context.stage,
      known_data: context.known_data,
      text,
    });

    context = { ...context, ...decision };

    console.log("🧠 TRACE — STRATEGY", {
      intent: context.intent,
      stage: context.stage,
      strategy: context.strategy,
    });

    /*
    ========================================
    🔥 FACT ROUTER (ANTES DE AI)
    ========================================
    */

    const factReply = resolveBusinessQuery(text, context);

    if (factReply) {
      console.log("🧠 TRACE — FACT RESPONSE USED");

      await saveMessage({
        organization_id,
        conversation_id: conversation.id,
        role: "assistant",
        text: factReply,
      });

      return {
        reply: { text: factReply },
      };
    }

    /*
    ========================================
    AI EXECUTION
    ========================================
    */

    const execution = await executeAI(context);

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
        text: "Con mucho gusto le ayudo 😊 ¿Me podría repetir su consulta?",
      },
    };
  }
}

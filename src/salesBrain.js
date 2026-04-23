/*
====================================================
EVA CORE — SALES BRAIN (CONTROLLED vNEXT FINAL)
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

import { buildPrompt } from "./brain/utils/promptBuilder.js";
import { runAI } from "./brain/engines/aiEngine.js";
import { getPromptConfig } from "./brain/utils/getPromptConfig.js";
import { formatAIResponse } from "./brain/utils/responseFormatter.js";

import { createFollowupsForConversation } from "./followupEngine.js";
import { calculateScore } from "./brain/engines/scoreEngine.js";

/*
====================================================
STRICT AI CONTROL
====================================================
*/

function enforceHardRules(text, context) {
  if (!text) return text;

  let clean = String(text).trim();

  // 🚫 No dump
  if (context.stage === "EARLY" && clean.length > 220) {
    clean = clean.slice(0, 200).trim() + "...";
  }

  // 🚫 Siempre avanzar conversación
  if (!clean.includes("?") && ["ASK", "QUALIFY"].includes(context.strategy)) {
    clean += " ¿Me podría indicar un poco más para ayudarle mejor?";
  }

  return clean;
}

/*
====================================================
AI EXECUTION (CONTROLLED)
====================================================
*/

async function executeAI(context) {
  const promptConfig = await getPromptConfig(context.organization.id);

  const promptPayload = buildPrompt({
    context,
    history: context.history || [],
    promptConfig,
  });

  const messages = [
    { role: "system", content: promptPayload.systemPrompt },
    { role: "user", content: promptPayload.userPrompt },
  ];

  let aiText = null;

  try {
    const ai = await runAI({
      prompt: messages,
      metadata: {
        intent: context.intent,
        stage: context.stage,
        strategy: context.strategy,
      },
    });

    aiText = ai?.text || null;
  } catch (err) {
    console.error("❌ AI ERROR:", err);
  }

  if (!aiText) {
    return {
      reply: "Con mucho gusto le ayudo 😊 ¿Me podría indicar un poco más?",
    };
  }

  let formatted = formatAIResponse({
    text: aiText,
    agentName: context?.assistant?.name || "Asistente",
  });

  formatted = enforceHardRules(formatted, context);

  return { reply: formatted };
}

/*
====================================================
MAIN
====================================================
*/

export async function handleInbound(payload) {
  try {
    const {
      organization_id,
      phone,
      text,
      channel = "whatsapp",
      message_id = null,
    } = payload || {};

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
    });

    let context =
      payload?.context ||
      (await buildContext({
        organization_id,
        phone,
        text,
      }));

    context = {
      ...context,
      user_message: text,
      phone,
      channel,
      message_id,
    };

    const scoreResult = calculateScore({
      lead: context?.lead || {},
      context,
      lastMessages: context?.history || [],
      now: Date.now(),
    });

    const decision = decideStrategy({
      intent: context.intent,
      stage: context.stage,
      known_data: context.known_data,
      sales_context: context.sales_context,
      text,
    });

    context = {
      ...context,
      intent: decision.intent,
      stage: decision.stage,
      strategy: decision.strategy,
      known_data: decision.known_data,
    };

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
      score: scoreResult.score,
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

    return {
      reply: { text: execution.reply },
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

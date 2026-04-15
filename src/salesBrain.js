/*
====================================================
EVA CORE — SALES BRAIN (SCORE INTELLIGENCE vNEXT.11)
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
import { calculateScore } from "./brain/engines/scoreEngine.js";

/*
====================================================
HELPERS
====================================================
*/

function classifyScore(score) {
  return {
    is_ready: score >= 85,
    is_hot: score >= 65,
    is_warm: score >= 40,
  };
}

/*
====================================================
AI (MISMO BLOQUE 3)
====================================================
*/

function fallbackResponse() {
  return {
    reply:
      "Con mucho gusto le ayudo 😊 ¿Me podría indicar un poco más sobre lo que necesita?",
  };
}

async function executeAI(context) {
  const promptConfig = await getPromptConfig(context.organization.id);

  const prompt = buildPrompt({
    context,
    history: context.history || [],
    promptConfig,
  });

  let aiText = null;

  try {
    const ai = await runAI({
      prompt: [{ role: "user", content: prompt }],
    });
    aiText = ai?.text || null;
  } catch (err) {}

  if (!aiText) return fallbackResponse();

  const formatted = formatAIResponse({
    text: aiText,
    agentName: context.assistant.name,
  });

  return { reply: formatted };
}

/*
====================================================
MAIN
====================================================
*/

export async function handleInbound(payload) {
  try {
    const { organization_id, phone, text } = payload;

    await findOrCreateLead({ organization_id, phone });

    const conversation = await findOrCreateConversation({
      organization_id,
      phone,
      channel: "whatsapp",
    });

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "user",
      text,
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
    SCORE
    ========================================
    */

    const scoreResult = calculateScore({
      lead: context?.lead || {},
      context,
      lastMessages: [],
      now: Date.now(),
    });

    const scoreSignals = classifyScore(scoreResult.score);

    /*
    ========================================
    PIPELINE EVENTS (NEW)
    ========================================
    */

    await savePipelineEvent({
      organization_id,
      conversation_id: conversation.id,
      lead_phone: phone,
      event_type: "LEAD_CLASSIFIED",
      event_data: {
        score: scoreResult.score,
        label: scoreResult.label,
        ...scoreSignals,
      },
    });

    /*
    ========================================
    STRATEGY OVERRIDE BY SCORE
    ========================================
    */

    if (scoreSignals.is_ready) {
      context.strategy = "CLOSE";
    } else if (scoreSignals.is_hot && context.strategy === "QUALIFY") {
      context.strategy = "RECOMMEND";
    }

    /*
    ========================================
    EXECUTION
    ========================================
    */

    const execution = await executeAI(context);

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      text: execution.reply,
    });

    /*
    ========================================
    UPDATE LEAD
    ========================================
    */

    await updateLeadStageAndScore({
      organization_id,
      phone,
      stage: context.stage || scoreResult.stage_suggested,
      score: scoreResult.score,
    });

    await updateLeadMemory({
      organization_id,
      phone,
      data: context.known_data,
    });

    /*
    ========================================
    FOLLOWUPS (INTELIGENTE)
    ========================================
    */

    await createFollowupsForConversation({
      organization_id,
      conversation_id: conversation.id,
      phone,
      context: {
        ...context,
        score: scoreResult.score,
        scoreSignals,
      },
    });

    return { reply: { text: execution.reply } };

  } catch (err) {
    console.error(err);

    return {
      reply: {
        text: "Con mucho gusto le ayudo 😊 ¿Me podría repetir su consulta?",
      },
    };
  }
}

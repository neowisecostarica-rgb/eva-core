/*
====================================================
EVA CORE — SALES BRAIN (STRATEGY INTELLIGENCE vNEXT FIXED)
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
ANTI DUMP CONTROL (🔥 NUEVO)
====================================================
*/

function enforceResponseControl({ text, strategy, stage }) {
  if (!text) return text;

  // ❌ evitar respuestas largas en EARLY
  if (stage === "EARLY" && text.length > 220) {
    return text.slice(0, 200) + "...";
  }

  // ❌ evitar respuestas sin pregunta en QUALIFY
  if (
    (strategy === "QUALIFY" || strategy === "ASK") &&
    !text.includes("?")
  ) {
    return text + " ¿Me podría indicar un poco más para ayudarle mejor?";
  }

  return text;
}

/*
====================================================
AI EXECUTION
====================================================
*/

function fallbackResponse(strategy = "DEFAULT") {
  // fallback estratégico
  if (strategy === "QUALIFY" || strategy === "ASK") {
    return {
      reply:
        "Con mucho gusto le ayudo 😊 ¿Me podría indicar un poco más sobre lo que necesita?",
    };
  }

  return {
    reply:
      "Con mucho gusto le ayudo 😊 ¿En qué le puedo apoyar?",
  };
}

async function executeAI(context) {
  const promptConfig = await getPromptConfig(context.organization.id);

  /*
  ========================================
  🔥 INYECTAR STRATEGY EN PROMPT
  ========================================
  */

  const enrichedContext = {
    ...context,
    system_strategy: context.strategy, // 🔥 clave
  };

  const prompt = buildPrompt({
    context: enrichedContext,
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

  if (!aiText) return fallbackResponse(context.strategy);

  const formatted = formatAIResponse({
    text: aiText,
    agentName: context.assistant.name,
  });

  /*
  ========================================
  🔥 ENFORCEMENT (CRÍTICO)
  ========================================
  */

  const controlled = enforceResponseControl({
    text: formatted,
    strategy: context.strategy,
    stage: context.stage,
  });

  return { reply: controlled };
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
    STRATEGY (REAL)
    ========================================
    */

    const decision = decideStrategy({
      intent: context.intent,
      stage: context.stage,
      known_data: context.known_data,
      strategy_inputs: context.strategy_inputs,
      text,
    });

    context = {
      ...context,
      strategy: decision?.strategy || "DEFAULT",
    };

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
    PIPELINE EVENTS
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
    FOLLOWUPS
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

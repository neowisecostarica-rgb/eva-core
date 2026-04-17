/*
====================================================
EVA CORE — SALES BRAIN (STRATEGY INTELLIGENCE vNEXT FIXED v2)
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
NORMALIZE STAGE (🔥 NUEVO CRÍTICO)
====================================================
*/

function normalizeStage(stage, fallback) {
  const valid = ["EARLY", "QUALIFYING", "MID", "HOT", "POST"];

  if (valid.includes(stage)) return stage;
  if (valid.includes(fallback)) return fallback;

  return "EARLY";
}

/*
====================================================
ANTI DUMP CONTROL (MEJORADO)
====================================================
*/

function enforceResponseControl({ text, strategy, stage }) {
  if (!text) return text;

  let clean = text;

  if (stage === "EARLY" && clean.length > 220) {
    clean = clean.slice(0, 200) + "...";
  }

  if (
    ["QUALIFY", "ASK", "DEFAULT"].includes(strategy) &&
    !clean.includes("?")
  ) {
    clean += " ¿Me podría indicar un poco más para ayudarle mejor?";
  }

  return clean;
}

/*
====================================================
STRATEGY ENFORCEMENT (🔥 NUEVO)
====================================================
*/

function enforceStrategyOutput({ text, strategy }) {
  if (!text) return text;

  if (strategy === "ASK" || strategy === "QUALIFY") {
    if (!text.includes("?")) {
      return (
        text +
        " ¿Podría darme un poco más de detalle para ayudarle mejor?"
      );
    }
  }

  return text;
}

/*
====================================================
AI EXECUTION
====================================================
*/

function fallbackResponse(strategy = "DEFAULT") {
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

  const enrichedContext = {
    ...context,
    system_strategy: context.strategy,
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

  let controlled = enforceResponseControl({
    text: formatted,
    strategy: context.strategy,
    stage: context.stage,
  });

  controlled = enforceStrategyOutput({
    text: controlled,
    strategy: context.strategy,
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
    STRATEGY
    ========================================
    */

    const decision = decideStrategy({
      intent: context.intent,
      stage: context.stage,
      known_data: context.known_data,
      strategy_inputs: context.strategy_inputs,
      text,
    });

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
    NORMALIZE STAGE
    ========================================
    */

    const finalStage = normalizeStage(
      context.stage,
      scoreResult.stage_suggested
    );

    /*
    ========================================
    STRATEGY FINAL
    ========================================
    */

    let finalStrategy = decision?.strategy || "DEFAULT";

    if (scoreSignals.is_ready) {
      finalStrategy = "CLOSE";
    } else if (scoreSignals.is_hot && finalStrategy === "QUALIFY") {
      finalStrategy = "RECOMMEND";
    }

    context = {
      ...context,
      stage: finalStage,
      strategy: finalStrategy,
    };

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
        stage: finalStage,
        strategy: finalStrategy,
        ...scoreSignals,
      },
    });

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
      stage: finalStage,
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

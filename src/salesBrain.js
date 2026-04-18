/*
====================================================
EVA CORE — SALES BRAIN (STRATEGY INTELLIGENCE vNEXT ALIGNED v3)
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
ANTI DUMP CONTROL
====================================================
*/

function enforceResponseControl({ text, strategy, stage }) {
  if (!text) return text;

  let clean = String(text).trim();

  if (stage === "EARLY" && clean.length > 220) {
    clean = clean.slice(0, 200).trim() + "...";
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
STRATEGY ENFORCEMENT
====================================================
*/

function enforceStrategyOutput({ text, strategy }) {
  if (!text) return text;

  const clean = String(text).trim();

  if (strategy === "ASK" || strategy === "QUALIFY") {
    if (!clean.includes("?")) {
      return (
        clean +
        " ¿Podría darme un poco más de detalle para ayudarle mejor?"
      );
    }
  }

  return clean;
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

  if (strategy === "RECOMMEND") {
    return {
      reply:
        "Con mucho gusto le ayudo 😊 Si me indica un poco más de lo que busca, le recomiendo una opción.",
    };
  }

  if (strategy === "CLOSE") {
    return {
      reply:
        "Con mucho gusto le ayudo 😊 Si gusta, lo podemos coordinar de una vez.",
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
  } catch (err) {
    console.error("❌ EXECUTE AI ERROR:", err);
  }

  if (!aiText) return fallbackResponse(context.strategy);

  const formatted = formatAIResponse({
    text: aiText,
    agentName: context?.assistant?.name || "Asistente",
    context: {
      stage: context.stage,
      strategy: context.strategy,
    },
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
    const {
      organization_id,
      phone,
      text,
      channel = "whatsapp",
      message_id = null,
    } = payload || {};

    /*
    ========================================
    LEAD
    ========================================
    */

    await findOrCreateLead({ organization_id, phone });

    /*
    ========================================
    CONVERSATION
    ========================================
    */

    const conversation = await findOrCreateConversation({
      organization_id,
      phone,
      channel,
    });

    /*
    ========================================
    INBOUND MESSAGE
    ========================================
    */

    // NOTA:
    // No agrego external_message_id aquí porque no vimos el contrato real de saveMessage/db.js.
    // La idempotencia ya se controla en routes/messages.js antes de llegar aquí.
    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "user",
      text,
    });

    /*
    ========================================
    CONTEXT
    ========================================
    */

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

    /*
    ========================================
    SCORE
    ========================================
    */

    const scoreResult = calculateScore({
      lead: context?.lead || {},
      context,
      lastMessages: context?.history || [],
      now: Date.now(),
    });

    const scoreSignals = classifyScore(scoreResult.score);

    /*
    ========================================
    STRATEGY FINAL AUTHORITY
    ========================================
    */

    const decision = decideStrategy({
      intent: context.intent,
      stage: context.stage,
      known_data: context.known_data,
      sales_context: context.sales_context,
      signals: scoreSignals,
      text,
    });

    const finalStage = decision?.stage || context.stage || "EARLY";
    const finalStrategy = decision?.strategy || "ASK";
    const finalIntent = decision?.intent || context.intent || "OTHER";
    const finalKnownData = decision?.known_data || context.known_data || {};

    context = {
      ...context,
      intent: finalIntent,
      stage: finalStage,
      strategy: finalStrategy,
      known_data: finalKnownData,
      strategy_reason: decision?.reason || null,
      strategy_inputs: {
        ...(context.strategy_inputs || {}),
        current_turn_known_data:
          decision?.current_turn_known_data || {},
      },
      sales_context: {
        ...(context.sales_context || {}),
        lead_score: scoreResult.score,
      },
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
        intent: finalIntent,
        stage: finalStage,
        strategy: finalStrategy,
        strategy_reason: decision?.reason || null,
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
      data: finalKnownData,
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

    return {
      reply: {
        text: execution.reply,
      },
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

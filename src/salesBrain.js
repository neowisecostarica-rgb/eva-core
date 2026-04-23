/*
====================================================
EVA CORE — SALES BRAIN (FUSION vNEXT FINAL)
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
CONTROL DE RESPUESTA (RECUPERADO + MEJORADO)
====================================================
*/

function enforceResponseControl({ text, strategy, stage }) {
  if (!text) return text;

  let clean = String(text).trim();

  // anti dump
  if (stage === "EARLY" && clean.length > 220) {
    clean = clean.slice(0, 200).trim() + "...";
  }

  // asegurar interacción
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
STRATEGY ENFORCEMENT (RECUPERADO)
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
FALLBACK (RECUPERADO)
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

  if (strategy === "EXPLAIN_CLOSE") {
    return {
      reply:
        "Con mucho gusto le ayudo 😊 Si me confirma un poco más del caso, le indico la mejor forma de coordinarlo.",
    };
  }

  return {
    reply:
      "Con mucho gusto le ayudo 😊 ¿En qué le puedo apoyar?",
  };
}

/*
====================================================
AI EXECUTION (CONTROLADO)
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
    console.error("❌ EXECUTE AI ERROR:", err);
  }

  if (!aiText) return fallbackResponse(context.strategy);

  let formatted = formatAIResponse({
    text: aiText,
    agentName: context?.assistant?.name || "Asistente",
  });

  formatted = enforceResponseControl({
    text: formatted,
    strategy: context.strategy,
    stage: context.stage,
  });

  formatted = enforceStrategyOutput({
    text: formatted,
    strategy: context.strategy,
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
    const {
      organization_id,
      phone,
      text,
      channel = "whatsapp",
      message_id = null,
    } = payload || {};

    /*
    ============================
    LEAD + CONVERSATION
    ============================
    */

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

    /*
    ============================
    CONTEXT
    ============================
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
    ============================
    SCORE + SIGNALS (RECUPERADO)
    ============================
    */

    const scoreResult = calculateScore({
      lead: context?.lead || {},
      context,
      lastMessages: context?.history || [],
      now: Date.now(),
    });

    const scoreSignals = classifyScore(scoreResult.score);

    /*
    ============================
    STRATEGY DECISION
    ============================
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
    ============================
    PIPELINE EVENT (RECUPERADO)
    ============================
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
    ============================
    AI RESPONSE
    ============================
    */

    const execution = await executeAI(context);

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      text: execution.reply,
    });

    /*
    ============================
    CRM UPDATE
    ============================
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
    ============================
    FOLLOWUPS
    ============================
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

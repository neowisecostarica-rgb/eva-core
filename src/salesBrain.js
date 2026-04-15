/*
====================================================
EVA CORE — SALES BRAIN (AI CONTROL vNEXT.10)
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
AI RESPONSE PARSER (NEW CORE)
====================================================
*/

function parseAIResponse(text = "") {
  try {
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");

    if (jsonStart !== -1 && jsonEnd !== -1) {
      const jsonString = text.slice(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonString);

      return {
        reply: parsed.reply || null,
        intent: parsed.intent || null,
        confidence: parsed.confidence || null,
        next_action: parsed.next_action || null,
      };
    }
  } catch (err) {
    console.error("AI JSON parse error:", err.message);
  }

  return null;
}

/*
====================================================
AI SAFE EXECUTION
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
      console.error("catalog error", err.message);
    }
  }

  const promptConfig = await getPromptConfig(context.organization.id);

  const prompt = buildPrompt({
    context,
    catalogResults,
    history: context.history || [],
    promptConfig,
  });

  /*
  ========================================
  JSON ENFORCEMENT
  ========================================
  */

  const enforcedPrompt = `
Responde en formato JSON válido:

{
  "reply": "mensaje al cliente",
  "intent": "BUY | INFO | SERVICE | OTHER",
  "confidence": 0.0,
  "next_action": "ASK | QUALIFY | CLOSE | FOLLOWUP"
}

Mensaje:
${prompt}
`;

  let aiText = null;

  try {
    const ai = await runAI({
      prompt: [{ role: "user", content: enforcedPrompt }],
    });
    aiText = ai?.text || null;
  } catch (err) {
    console.error("AI error", err.message);
  }

  if (!aiText) {
    return fallbackResponse(context);
  }

  const parsed = parseAIResponse(aiText);

  /*
  ========================================
  VALIDATION LAYER
  ========================================
  */

  if (!parsed || !parsed.reply) {
    return fallbackResponse(context);
  }

  const formatted = formatAIResponse({
    text: parsed.reply,
    agentName: context.assistant.name,
  });

  return {
    reply: formatted,
    meta: parsed,
  };
}

/*
====================================================
FALLBACK SAFE RESPONSE
====================================================
*/

function fallbackResponse(context) {
  return {
    reply:
      "Con mucho gusto le ayudo 😊 ¿Me podría indicar un poco más sobre lo que necesita?",
  };
}

/*
====================================================
STRATEGY EXECUTION
====================================================
*/

async function executeByStrategy(context) {
  const strategy = context.strategy;

  if (strategy === "ASK" || strategy === "QUALIFY") {
    return fallbackResponse(context);
  }

  if (strategy === "FOLLOWUP") {
    return {
      reply:
        "Solo quería darle seguimiento 😊 ¿Le puedo ayudar con algo más?",
    };
  }

  return executeAI(context);
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
    EXECUTION
    ========================================
    */

    const execution = await executeByStrategy(context);

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      text: execution.reply,
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

    await createFollowupsForConversation({
      organization_id,
      conversation_id: conversation.id,
      phone,
      context,
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

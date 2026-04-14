/*
====================================================
EVA CORE — SALES BRAIN (Conversion + Human Flow vNext FINAL + STAGE ENGINE)
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

/*
====================================================
UTILS
====================================================
*/

function safe(value) {
  return String(value || "").trim();
}

function lowerText(value) {
  return safe(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/*
====================================================
🔥 STAGE ENGINE (CRITICAL)
====================================================
*/

function detectStageReal(context = {}, text = "") {
  const t = lowerText(text);
  const known = context.known_data || {};
  const sales = context.sales_context || {};

  // HOT
  if (
    t.includes("apartar") ||
    t.includes("comprar") ||
    t.includes("lo quiero") ||
    t.includes("coordinar")
  ) {
    return "HOT";
  }

  // MID
  if (
    t.includes("precio") ||
    t.includes("cuanto") ||
    t.includes("disponible") ||
    sales?.interest_level === "HIGH"
  ) {
    return "MID";
  }

  // QUALIFYING
  if (
    known?.budget ||
    known?.use_case ||
    known?.product_interest
  ) {
    return "QUALIFYING";
  }

  // EARLY
  return "EARLY";
}

function enforceStage(context, text) {
  const detected = detectStageReal(context, text);

  // nunca retroceder
  const order = ["EARLY", "QUALIFYING", "MID", "HOT", "POST"];

  const currentIndex = order.indexOf(context.stage || "EARLY");
  const detectedIndex = order.indexOf(detected);

  if (detectedIndex > currentIndex) {
    return detected;
  }

  return context.stage || detected;
}

/*
====================================================
🔥 STRATEGY ENFORCEMENT
====================================================
*/

function enforceStrategyRequired(strategy, context) {
  const valid = [
    "ASK",
    "QUALIFY",
    "EXPLAIN",
    "RECOMMEND",
    "CLOSE",
    "FOLLOWUP",
    "EXPLAIN_CLOSE",
    "DEFAULT",
  ];

  if (!strategy || !valid.includes(strategy)) {
    if (context.intent === "SERVICE") return "ASK";
    if (context.intent === "BUY") return "QUALIFY";
    return "DEFAULT";
  }

  return strategy;
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
    const aiResult = await runAI({
      prompt: [{ role: "user", content: prompt }],
    });

    aiText = aiResult?.text || aiResult?.reply || null;
  } catch {}

  if (!aiText) {
    return {
      reply:
        "Con mucho gusto le ayudo 😊 ¿Me podría indicar un poco más sobre lo que necesita?",
    };
  }

  if (context.strategy === "RECOMMEND" || context.strategy === "CLOSE") {
    aiText = enhanceProductReply({
      reply: aiText,
      intent: context.intent,
      catalogMatches: catalogResults,
      data: context.sales_context,
    });
  }

  return {
    reply: formatAIResponse({
      text: aiText,
      agentName: context.assistant.name,
    }),
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

    const lead = await findOrCreateLead({ organization_id, phone });

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

    // 🔥 STAGE CORRECTION
    context.stage = enforceStage(context, text);

    const decision = decideStrategy({
      intent: context.intent,
      stage: context.stage,
      known_data: context.known_data,
      text,
    });

    context.strategy = enforceStrategyRequired(
      decision?.strategy,
      context
    );

    const execution = await executeStrategy(context);

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      text: execution.reply,
    });

    return {
      reply: { text: execution.reply },
      meta: {
        intent: context.intent,
        stage: context.stage,
        strategy: context.strategy,
      },
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

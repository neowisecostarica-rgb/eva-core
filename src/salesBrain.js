/*
====================================================
EVA CORE — SALES BRAIN (Conversion Phase FULL FILE)
====================================================
*/

import {
  findOrCreateLead,
  findOrCreateConversation,
  saveMessage,
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
🔥 STAGE ENGINE
====================================================
*/

function detectStageReal(context = {}, text = "") {
  const t = lowerText(text);
  const known = context.known_data || {};
  const sales = context.sales_context || {};

  if (
    t.includes("apartar") ||
    t.includes("comprar") ||
    t.includes("lo quiero") ||
    t.includes("coordinar")
  ) return "HOT";

  if (
    t.includes("precio") ||
    t.includes("cuanto") ||
    t.includes("disponible") ||
    sales?.interest_level === "HIGH"
  ) return "MID";

  if (known?.budget || known?.use_case || known?.product_interest)
    return "QUALIFYING";

  return "EARLY";
}

function enforceStage(context, text) {
  const detected = detectStageReal(context, text);
  const order = ["EARLY", "QUALIFYING", "MID", "HOT", "POST"];

  const currentIndex = order.indexOf(context.stage || "EARLY");
  const detectedIndex = order.indexOf(detected);

  if (detectedIndex > currentIndex) return detected;
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
🔥 RESPONSE CONTROL (ANTI-DUMP + FLOW)
====================================================
*/

function enforceResponseControl(context, text) {
  let reply = String(text || "").trim();
  const stage = context.stage;
  const t = lowerText(reply);

  if (!reply) return reply;

  // 🔴 Anti dump global
  if (reply.length > 220) {
    reply = reply.slice(0, 200).trim() + "...";
  }

  const lines = reply.split("\n").filter(Boolean);
  if (lines.length > 3) {
    reply = lines.slice(0, 2).join("\n");
  }

  // 🔴 EARLY → preguntar siempre
  if (stage === "EARLY") {
    if (!reply.includes("?")) {
      reply += " ¿Para qué uso la necesita?";
    }
    if (reply.length > 120) {
      reply = reply.slice(0, 120).trim();
    }
  }

  // 🔴 QUALIFYING → empujar datos
  if (stage === "QUALIFYING") {
    if (!reply.includes("?")) {
      reply += " ¿Qué presupuesto tiene pensado?";
    }
  }

  // 🔴 MID → no saturar
  if (stage === "MID") {
    if (reply.includes("\n")) {
      reply = reply.split("\n")[0];
    }
  }

  // 🔴 HOT → cierre obligatorio
  if (stage === "HOT") {
    if (
      !t.includes("apartar") &&
      !t.includes("coordinar") &&
      !t.includes("entrega")
    ) {
      reply += " 👍 Si gusta se lo puedo dejar apartado de una vez.";
    }
  }

  return reply.trim();
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

  let reply = formatAIResponse({
    text: aiText,
    agentName: context.assistant.name,
  });

  reply = enforceResponseControl(context, reply);

  return { reply };
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

    context = {
      ...context,
      user_message: text,
      lead_id: lead?.id,
      conversation_id: conversation?.id,
    };

    // 🔥 STAGE
    context.stage = enforceStage(context, text);

    // 🔥 STRATEGY
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

    if (!context.strategy) {
      throw new Error("Strategy missing");
    }

    // 🔥 EXECUTION
    const execution = await executeStrategy(context);

    // 🔥 SAVE
    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      text: execution.reply,
    });

    // 🔥 MEMORY (básica)
    if (lead?.id) {
      await updateLeadStageAndScore({
        organization_id,
        lead_id: lead.id,
        new_stage: context.stage.toLowerCase(),
        new_score: 50,
      });

      await updateLeadMemory({
        organization_id,
        lead_id: lead.id,
        memory: {
          last_intent: context.intent,
        },
      });
    }

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

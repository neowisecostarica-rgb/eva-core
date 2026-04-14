/*
====================================================
EVA CORE — SALES BRAIN (Stage Lock FULL FILE)
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
import { createFollowupsForConversation } from "./followupEngine.js";

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

function hasValue(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

const STAGE_ORDER = ["EARLY", "QUALIFYING", "MID", "HOT", "POST"];

/*
====================================================
🔥 MEMORY CONTROL
====================================================
*/

function isTestMode(payload = {}) {
  return (
    payload?.test_mode === true ||
    payload?.sandbox === true ||
    payload?.ignore_memory === true
  );
}

function sanitizeContextForTest(context = {}) {
  return {
    ...context,
    stage: "EARLY",
    known_data: {},
    history: [],
    sales_context: {},
  };
}

/*
====================================================
🔥 INTENT HARDENING
====================================================
*/

function normalizeIntent(rawIntent = "", text = "", context = {}) {
  const intent = String(rawIntent || "").toUpperCase();
  const t = lowerText(text);
  const known = context?.known_data || {};

  if (intent && intent !== "UNKNOWN") {
    if (intent === "CLOSE_INTENT") return "BUY";
    return intent;
  }

  if (
    t.includes("precio") ||
    t.includes("cuanto") ||
    t.includes("cuánto") ||
    t.includes("vale") ||
    t.includes("costo") ||
    t.includes("cuesta") ||
    t.includes("cuestan")
  ) {
    return "BUY";
  }

  if (
    t.includes("tiene ") ||
    t.includes("tienen") ||
    t.includes("busco") ||
    t.includes("buscando") ||
    t.includes("ocupo") ||
    t.includes("necesito") ||
    t.includes("quiero") ||
    t.includes("comprar") ||
    t.includes("disponible") ||
    t.includes("opciones") ||
    t.includes("laptop") ||
    t.includes("computadora") ||
    t.includes("compu")
  ) {
    return "BUY";
  }

  if (
    t.includes("mantenimiento") ||
    t.includes("reparacion") ||
    t.includes("reparación") ||
    t.includes("servicio tecnico") ||
    t.includes("servicio técnico") ||
    t.includes("no imprime") ||
    t.includes("no enciende") ||
    t.includes("fallando") ||
    t.includes("ocupa revision") ||
    t.includes("ocupa revisión")
  ) {
    return "SERVICE";
  }

  if (
    t === "hola" ||
    t === "buenas" ||
    t === "buenos dias" ||
    t === "buenas tardes" ||
    t === "buenas noches" ||
    t === "hello" ||
    t === "hi"
  ) {
    return "GREETING";
  }

  if (
    hasValue(known?.budget) ||
    hasValue(known?.product_interest) ||
    hasValue(known?.use_case)
  ) {
    return "BUY";
  }

  return "UNKNOWN";
}

/*
====================================================
🔥 COMMERCIAL SIGNALS
====================================================
*/

function detectCommercialSignals(text = "", context = {}) {
  const t = lowerText(text);
  const known = context?.known_data || {};
  const current = context?.current_turn_known_data || {};
  const salesContext = context?.sales_context || {};

  return {
    price_interest:
      t.includes("precio") ||
      t.includes("cuanto") ||
      t.includes("cuánto") ||
      t.includes("vale") ||
      t.includes("costo") ||
      t.includes("cuesta"),
    availability_check:
      t.includes("disponible") ||
      t.includes("tienen") ||
      t.includes("tiene") ||
      t.includes("hay") ||
      t.includes("cuantas tiene") ||
      t.includes("cuántas tiene") ||
      t.includes("stock"),
    buy_signal:
      t.includes("quiero") ||
      t.includes("comprar") ||
      t.includes("me lo dejo") ||
      t.includes("me lo deja") ||
      t.includes("apartar") ||
      t.includes("apartado") ||
      t.includes("me interesa"),
    confirmation_signal:
      t === "si" ||
      t === "sí" ||
      t === "si claro" ||
      t === "sí claro" ||
      t === "claro" ||
      t === "dale" ||
      t === "ok" ||
      t === "esta bien" ||
      t === "está bien" ||
      t === "de acuerdo",
    budget_detected:
      hasValue(current?.budget) || hasValue(known?.budget),
    product_interest_detected:
      hasValue(current?.product_interest) ||
      hasValue(known?.product_interest),
    use_case_detected:
      hasValue(current?.use_case) || hasValue(known?.use_case),
    high_intent:
      String(salesContext?.interest_level || "LOW").toUpperCase() ===
        "HIGH" || t.includes("quiero"),
  };
}

function calculateLeadScore(context = {}, signals = {}) {
  let score = 0;

  if (context.intent === "BUY") score += 20;
  if (signals.price_interest) score += 10;
  if (signals.availability_check) score += 10;
  if (signals.budget_detected) score += 15;
  if (signals.product_interest_detected) score += 15;
  if (signals.use_case_detected) score += 10;
  if (signals.buy_signal) score += 20;
  if (signals.confirmation_signal) score += 10;
  if (signals.high_intent) score += 20;

  return Math.min(score, 100);
}

function mapInterestLevel(score = 0) {
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

/*
====================================================
🔥 STAGE LOCK ENGINE
====================================================
*/

function normalizeStage(value = "") {
  const stage = String(value || "").toUpperCase();
  return STAGE_ORDER.includes(stage) ? stage : "EARLY";
}

function getLockedStageFromLead(lead = {}) {
  const raw =
    lead?.stage ||
    lead?.current_stage ||
    lead?.lead_stage ||
    "EARLY";

  const normalized = normalizeStage(raw);

  if (normalized === "READY_TO_BUY") return "HOT";
  return normalized;
}

function detectStageReal(context = {}, text = "", signals = {}) {
  const t = lowerText(text);
  const intent = normalizeIntent(context.intent, text, context);
  const lockedStage = normalizeStage(context.locked_stage || "EARLY");

  if (lockedStage === "POST") return "POST";
  if (lockedStage === "HOT") return "HOT";

  if (
    signals.buy_signal ||
    t.includes("lo quiero") ||
    t.includes("quiero comprar") ||
    t.includes("apartar") ||
    t.includes("apártelo") ||
    t.includes("apartemelo") ||
    t.includes("apartar") ||
    t.includes("coordinar") ||
    t.includes("me lo dejo") ||
    t.includes("me la dejo")
  ) {
    return "HOT";
  }

  if (
    signals.price_interest ||
    signals.availability_check ||
    signals.budget_detected
  ) {
    return "MID";
  }

  if (
    intent === "BUY" &&
    (signals.use_case_detected ||
      signals.product_interest_detected ||
      hasValue(context?.known_data?.product) ||
      hasValue(context?.known_data?.model))
  ) {
    return "QUALIFYING";
  }

  if (intent === "GREETING") return "EARLY";

  if (intent === "BUY") return "QUALIFYING";

  return "EARLY";
}

function enforceStage(context, text, signals = {}) {
  const currentStage = normalizeStage(context.stage || "EARLY");
  const lockedStage = normalizeStage(context.locked_stage || currentStage);
  const detectedStage = detectStageReal(
    { ...context, stage: currentStage, locked_stage: lockedStage },
    text,
    signals
  );

  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  const lockedIndex = STAGE_ORDER.indexOf(lockedStage);
  const detectedIndex = STAGE_ORDER.indexOf(detectedStage);

  const floorIndex = Math.max(currentIndex, lockedIndex, 0);
  const finalIndex = Math.max(floorIndex, detectedIndex);

  return STAGE_ORDER[finalIndex] || "EARLY";
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
    if (context.intent === "BUY" && context.stage === "HOT") return "CLOSE";
    if (context.intent === "BUY" && context.stage === "MID") return "RECOMMEND";
    if (context.intent === "BUY") return "QUALIFY";
    return "DEFAULT";
  }

  if (context.stage === "HOT" && strategy !== "CLOSE") {
    return "CLOSE";
  }

  if (
    context.intent === "BUY" &&
    context.stage === "MID" &&
    strategy === "ASK"
  ) {
    return "RECOMMEND";
  }

  return strategy;
}

/*
====================================================
🔥 RESPONSE CONTROL
====================================================
*/

function enforceResponseControl(context, text) {
  let reply = String(text || "").trim();
  const stage = context.stage;
  const t = lowerText(reply);

  if (!reply) return reply;

  if (reply.length > 220) {
    reply = reply.slice(0, 200).trim() + "...";
  }

  const lines = reply.split("\n").filter(Boolean);
  if (lines.length > 3) {
    reply = lines.slice(0, 2).join("\n");
  }

  if (stage === "EARLY") {
    if (!reply.includes("?")) {
      reply += " ¿Para qué uso la necesita?";
    }
    if (reply.length > 120) {
      reply = reply.slice(0, 120).trim();
    }
  }

  if (stage === "QUALIFYING") {
    if (!reply.includes("?")) {
      reply += " ¿Qué presupuesto tiene pensado?";
    }
  }

  if (stage === "MID") {
    if (reply.includes("\n")) {
      reply = reply.split("\n")[0];
    }
  }

  if (stage === "HOT") {
    if (
      !t.includes("apartar") &&
      !t.includes("coordinar") &&
      !t.includes("entrega") &&
      !t.includes("apartado")
    ) {
      reply += " 👍 Si gusta se lo puedo dejar apartado de una vez.";
    }
  }

  return reply.trim();
}

/*
====================================================
🔥 SAFE CONTEXT
====================================================
*/

function ensureContext(context = {}) {
  return {
    organization: context.organization || { id: null },
    assistant: context.assistant || { name: "Asistente" },
    intent: context.intent || "UNKNOWN",
    stage: normalizeStage(context.stage || "EARLY"),
    known_data: context.known_data || {},
    history: Array.isArray(context.history) ? context.history : [],
    sales_context: context.sales_context || {},
    ...context,
  };
}

/*
====================================================
🔥 LOGGING ENGINE
====================================================
*/

async function logExecution({
  organization_id,
  conversation_id,
  context,
  text,
  reply,
}) {
  try {
    await savePipelineEvent({
      organization_id,
      conversation_id,
      lead_phone: context?.phone || null,
      event_type: "MESSAGE_PROCESSED",
      event_data: {
        user_input: text,
        reply,
        intent: context.intent,
        stage: context.stage,
        locked_stage: context.locked_stage,
        strategy: context.strategy,
        interest_level: context?.sales_context?.interest_level,
        lead_score: context?.sales_context?.lead_score,
        test_mode: context?.test_mode || false,
      },
    });
  } catch (err) {
    console.warn("logExecution failed", err.message);
  }
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

    const testMode = isTestMode(payload);

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

    context = ensureContext({
      ...context,
      user_message: text,
      lead_id: lead?.id,
      conversation_id: conversation?.id,
      phone,
      test_mode: testMode,
      locked_stage: getLockedStageFromLead(lead),
    });

    if (testMode) {
      context = ensureContext({
        ...sanitizeContextForTest(context),
        phone,
        test_mode: true,
        locked_stage: "EARLY",
      });
    }

    context.intent = normalizeIntent(context.intent, text, context);

    const initialSignals = detectCommercialSignals(text, context);
    const initialScore = calculateLeadScore(context, initialSignals);
    const initialInterestLevel = mapInterestLevel(initialScore);

    context.sales_context = {
      ...context.sales_context,
      interest_level: initialInterestLevel,
      lead_score: initialScore,
    };

    context.stage = enforceStage(context, text, initialSignals);

    const decision = decideStrategy({
      intent: context.intent,
      stage: context.stage,
      known_data: context.known_data,
      text,
    });

    context.strategy = enforceStrategyRequired(decision?.strategy, context);

    if (!context.strategy) {
      throw new Error("Strategy missing");
    }

    const finalSignals = detectCommercialSignals(text, context);
    const finalScore = calculateLeadScore(context, finalSignals);
    const finalInterestLevel = mapInterestLevel(finalScore);

    context.sales_context = {
      ...context.sales_context,
      interest_level: finalInterestLevel,
      lead_score: finalScore,
    };

    const execution = await executeStrategy(context);

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      text: execution.reply,
    });
    
await createFollowupsForConversation({
  organization_id,
  conversation_id: conversation.id,
  phone,
  context,
});
    
    await logExecution({
      organization_id,
      conversation_id: conversation.id,
      context,
      text,
      reply: execution.reply,
    });

    if (!testMode && lead?.id) {
      await updateLeadStageAndScore({
        organization_id,
        lead_id: lead.id,
        new_stage: context.stage.toLowerCase(),
        new_score: context?.sales_context?.lead_score || 50,
      });

      await updateLeadMemory({
        organization_id,
        lead_id: lead.id,
        memory: {
          last_intent: context.intent,
          interest_level: context?.sales_context?.interest_level,
          locked_stage: context.stage,
        },
      });
    }

    return {
      reply: { text: execution.reply },
      meta: {
        intent: context.intent,
        stage: context.stage,
        locked_stage: context.locked_stage,
        strategy: context.strategy,
        interest_level: context?.sales_context?.interest_level,
        score: context?.sales_context?.lead_score,
        test_mode: testMode,
      },
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

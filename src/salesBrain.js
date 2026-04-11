/*
====================================================
EVA CORE — SALES BRAIN (BLOCK 5.1 — ENFORCED)
====================================================
*/
import {
  findOrCreateLead,
  findOrCreateConversation,
  saveMessage,
} from "./db.js";

import { scheduleFollowup } from "./followupEngine.js";

import { detectIntent } from "./brain/engines/intentEngine.js";
import {
  decideStrategy,
  normalizeIntent,
} from "./brain/engines/strategyEngine.js";

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

function lower(value) {
  return safe(value).toLowerCase();
}

function clampText(text, max = 420) {
  const clean = safe(text).replace(/\s+/g, " ");
  if (!clean) return "";
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trim() + "…";
}

function hasAny(text, patterns = []) {
  const t = lower(text);
  return patterns.some((p) => t.includes(String(p).toLowerCase()));
}

function normalizePrice(product = {}) {
  if (product.price !== undefined && product.price !== null) {
    return Number(product.price) || 0;
  }

  if (product.price_crc !== undefined && product.price_crc !== null) {
    return Number(product.price_crc) || 0;
  }

  return 0;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeTextForMemory(text) {
  return clampText(safe(text), 220);
}

/*
====================================================
KNOWN DATA / HEURISTICS
====================================================
*/

function detectBudget(text) {
  const t = safe(text);

  const colonMatch = t.match(/₡\s*([\d.,]+)/i);
  if (colonMatch?.[1]) {
    const n = Number(colonMatch[1].replace(/[.,]/g, ""));
    if (!Number.isNaN(n) && n > 0) return n;
  }

  const milMatch = t.match(/(\d{2,3})\s*mil\b/i);
  if (milMatch?.[1]) {
    const n = Number(milMatch[1]) * 1000;
    if (!Number.isNaN(n) && n > 0) return n;
  }

  const rawNumber = t.match(/\b(\d{5,7})\b/);
  if (rawNumber?.[1]) {
    const n = Number(rawNumber[1]);
    if (!Number.isNaN(n) && n > 0) return n;
  }

  return null;
}

function detectUseCase(text) {
  const t = lower(text);

  if (
    hasAny(t, [
      "estudio",
      "colegio",
      "escuela",
      "universidad",
      "clases",
      "tareas",
      "estudiar",
    ])
  ) {
    return "STUDY";
  }

  if (
    hasAny(t, [
      "trabajo",
      "oficina",
      "office",
      "excel",
      "teletrabajo",
      "empresa",
      "empresarial",
    ])
  ) {
    return "WORK";
  }

  if (
    hasAny(t, [
      "diseño",
      "editar",
      "edicion",
      "video",
      "photoshop",
      "render",
      "arquitectura",
    ])
  ) {
    return "CREATIVE";
  }

  if (
    hasAny(t, [
      "gaming",
      "jugar",
      "juegos",
      "fortnite",
      "valorant",
      "warzone",
    ])
  ) {
    return "GAMING";
  }

  return null;
}

function detectProblem(text) {
  const t = lower(text);

  if (
    hasAny(t, [
      "no imprime",
      "no enciende",
      "se apaga",
      "pantalla negra",
      "error",
      "atascada",
      "atasco",
      "bateria",
      "batería",
      "lenta",
      "sobrecalienta",
      "no carga",
      "dañado",
      "danado",
      "fallando",
      "reparar",
      "mantenimiento",
    ])
  ) {
    return safe(text);
  }

  return null;
}

function detectProductInterest(text) {
  const t = lower(text);

  if (hasAny(t, ["laptop", "compu", "computadora", "portatil", "portátil"])) {
    return "LAPTOP";
  }

  if (hasAny(t, ["impresora", "printer"])) {
    return "PRINTER";
  }

  if (hasAny(t, ["monitor"])) {
    return "MONITOR";
  }

  if (hasAny(t, ["teclado", "mouse", "accesorio", "cargador", "adaptador"])) {
    return "ACCESSORY";
  }

  return null;
}

function buildKnownData(text) {
  return {
    budget: detectBudget(text),
    use_case: detectUseCase(text),
    problem: detectProblem(text),
    product_interest: detectProductInterest(text),
  };
}

function mergeKnownData(...sources) {
  const merged = {
    budget: null,
    use_case: null,
    problem: null,
    product_interest: null,
  };

  for (const source of sources) {
    if (!isObject(source)) continue;

    if (!merged.budget && source.budget) merged.budget = source.budget;
    if (!merged.use_case && source.use_case) merged.use_case = source.use_case;
    if (!merged.problem && source.problem) merged.problem = source.problem;
    if (!merged.product_interest && source.product_interest) {
      merged.product_interest = source.product_interest;
    }
  }

  return merged;
}

function detectStage({ intent, text, known_data = {} }) {
  const t = lower(text);

  const hasBudget = !!known_data.budget;
  const hasUseCase = !!known_data.use_case;
  const hasProblem = !!known_data.problem;

  // 🔥 SERVICE
  if (intent === "SERVICE") {
    return hasProblem ? "QUALIFYING" : "EARLY";
  }

  // 🔥 GREETING nunca HOT
  if (intent === "GREETING") {
    return "EARLY";
  }

  // 🔥 mensajes cortos nunca HOT
  if (t.length < 12) {
    return "EARLY";
  }

  // 🔥 interés medio
  if (
    hasAny(t, [
      "me interesa",
      "precio",
      "cuánto cuesta",
      "disponible",
      "info",
      "información",
    ])
  ) {
    if (hasBudget && hasUseCase) return "MID";
    return "QUALIFYING";
  }

  // 🔥 cierre SOLO con evidencia fuerte
  if (
    hasAny(t, [
      "quiero comprar",
      "la compro",
      "lo compro",
      "apartar",
      "reservar",
      "cómo pago",
      "sinpe",
      "transferencia",
    ])
  ) {
    return "HOT";
  }

  if (hasUseCase || hasBudget) return "QUALIFYING";

  return "EARLY";
}

/*
====================================================
STRATEGY / CONTEXT ENFORCEMENT
====================================================
*/

function normalizeStage(stage, fallback = "EARLY") {
  const normalized = safe(stage).toUpperCase();
  const allowed = ["EARLY", "QUALIFYING", "MID", "HOT", "POST"];
  return allowed.includes(normalized) ? normalized : fallback;
}

function normalizeStrategyName(value) {
  const v = safe(value).toUpperCase();

  const allowed = [
    "ASK",
    "QUALIFY",
    "EXPLAIN",
    "EXPLAIN_CLOSE",
    "RECOMMEND",
    "CLOSE",
    "FOLLOWUP",
    "HYBRID",
    "DEFAULT",
  ];

  if (allowed.includes(v)) return v;
  return "";
}

function normalizeStrategyDecision(strategyDecision, fallbackContext = {}) {
  if (typeof strategyDecision === "string") {
    const direct = normalizeStrategyName(strategyDecision);
    if (direct) {
      return {
        strategy: direct,
        source: "direct_string",
      };
    }
  }

  if (isObject(strategyDecision)) {
    const fromObject = normalizeStrategyName(
      strategyDecision.strategy || strategyDecision.type || strategyDecision.name
    );

    if (fromObject) {
      return {
        ...strategyDecision,
        strategy: fromObject,
      };
    }
  }

  const fallbackIntent = safe(fallbackContext.intent).toUpperCase();
  const fallbackStage = normalizeStage(fallbackContext.stage, "EARLY");
  const fallbackKnownData = fallbackContext.known_data || {};

  if (fallbackIntent === "SERVICE") {
    return {
      strategy: fallbackKnownData.problem ? "EXPLAIN_CLOSE" : "ASK",
      source: "fallback_service",
    };
  }

  if (fallbackIntent === "BUY") {
    if (fallbackStage === "HOT") {
      return { strategy: "CLOSE", source: "fallback_buy_hot" };
    }
    if (fallbackStage === "MID") {
      return { strategy: "RECOMMEND", source: "fallback_buy_mid" };
    }
    return { strategy: "QUALIFY", source: "fallback_buy_default" };
  }

  if (fallbackIntent === "FOLLOWUP") {
    return { strategy: "FOLLOWUP", source: "fallback_followup" };
  }

  if (fallbackIntent === "GREETING") {
    return { strategy: "ASK", source: "fallback_greeting" };
  }

  return { strategy: "ASK", source: "fallback_default" };
}

function ensureContextShape(rawContext, fallback = {}) {
  const mergedKnownData = mergeKnownData(
    fallback.known_data,
    rawContext?.known_data,
    rawContext?.sales_context,
    rawContext?.knownData
  );

  const intent = normalizeIntent(rawContext?.intent || fallback.intent || "OTHER");
  const stage = normalizeStage(rawContext?.stage || fallback.stage || "EARLY");

  const assistantName =
    rawContext?.assistant?.name ||
    rawContext?.assistant_name ||
    "Eva";

  const businessName =
    rawContext?.organization?.business_name ||
    rawContext?.organization?.name ||
    rawContext?.business_name ||
    "el negocio";

  return {
    ...rawContext,
    intent,
    stage,
    known_data: mergedKnownData,
    history: Array.isArray(rawContext?.history) ? rawContext.history : [],
    user_message: safe(rawContext?.user_message || fallback.user_message || ""),
    assistant: {
      ...(rawContext?.assistant || {}),
      name: assistantName,
    },
    organization: {
      ...(rawContext?.organization || {}),
      id: safe(rawContext?.organization?.id || fallback.organization_id || ""),
      business_name: businessName,
      name: rawContext?.organization?.name || businessName,
    },
    sales_context: isObject(rawContext?.sales_context)
      ? rawContext.sales_context
      : {},
  };
}

function assertContextReady(context) {
  if (!context?.organization?.id) {
    throw new Error("Missing context.organization.id");
  }

  if (!context?.intent) {
    throw new Error("Missing context.intent");
  }

  if (!context?.stage) {
    throw new Error("Missing context.stage");
  }

  if (!safe(context?.user_message)) {
    throw new Error("Missing context.user_message");
  }
}

/*
====================================================
AI CONTROL
====================================================
*/

function shouldSearchCatalog(context) {
  if (!context) return false;

  const { strategy, intent, known_data = {} } = context;

  // SOLO CUANDO TIENE SENTIDO COMERCIAL

  if (strategy === "RECOMMEND") return true;
  if (strategy === "CLOSE") return true;

  if (strategy === "EXPLAIN") {
    // solo si hay intención de producto o servicio
    if (known_data.product_interest) return true;
    if (intent === "BUY" || intent === "INFO") return true;
  }

  return false;
}

function shouldUseAI(context) {
  if (!context) return false;

  const { intent, strategy, known_data = {} } = context;

  if (!strategy) return false;
  if (intent === "GREETING") return false;

  // Estrategias controladas por sistema
  if (strategy === "ASK") return false;

  // QUALIFY básica mejor deterministic
  if (
    strategy === "QUALIFY" &&
    !known_data.use_case &&
    !known_data.budget &&
    !known_data.product_interest
  ) {
    return false;
  }

  return true;
}

function buildAIMessages(prompt) {
  return [
    {
      role: "user",
      content: prompt,
    },
  ];
}

function normalizeAIResult(aiResult, context, catalogResults = []) {
  const rawText =
    safe(aiResult?.text) ||
    safe(aiResult?.reply) ||
    safe(aiResult?.content) ||
    "";

  const explicitIntent = normalizeIntent(aiResult?.intent || context?.intent || "OTHER");
  const explicitStage = normalizeStage(aiResult?.stage || context?.stage || "EARLY");

  const explicitConfidenceNumber = Number(aiResult?.confidence);
  const hasExplicitConfidence = !Number.isNaN(explicitConfidenceNumber);

  let derivedConfidence = 0.62;

  if (rawText) derivedConfidence = 0.72;
  if (context?.strategy === "RECOMMEND" && catalogResults.length > 0) {
    derivedConfidence = 0.78;
  }
  if (context?.strategy === "CLOSE" && catalogResults.length > 0) {
    derivedConfidence = 0.8;
  }

  const confidence = hasExplicitConfidence
    ? explicitConfidenceNumber
    : derivedConfidence;

  return {
    reply: rawText,
    intent: explicitIntent,
    stage: explicitStage,
    confidence,
    escalate_to_human: !!aiResult?.escalate_to_human,
    raw: aiResult || null,
  };
}

function getConfidenceThreshold(context) {
  const configured = Number(
    context?.organization?.ai_confidence_threshold ||
      context?.prompt_config?.ai_confidence_threshold ||
      context?.sales_context?.ai_confidence_threshold
  );

  if (!Number.isNaN(configured) && configured > 0 && configured < 1) {
    return configured;
  }

  return 0.65;
}

function shouldAcceptAIReply(aiEnvelope, context, catalogResults = []) {
  if (!aiEnvelope?.reply) return false;
  if (aiEnvelope?.escalate_to_human) return false;

  const threshold = getConfidenceThreshold(context);

  if (aiEnvelope.confidence < threshold) return false;

  if (
    (context?.strategy === "RECOMMEND" || context?.strategy === "CLOSE") &&
    catalogResults.length === 0
  ) {
    return false;
  }

  return true;
}

/*
====================================================
FALLBACKS
====================================================
*/

function buildFallbackReply(context, products = []) {
  const { intent, strategy, known_data = {} } = context || {};

  if (intent === "SERVICE" || strategy === "ASK") {
    if (!known_data.problem) {
      return "Con mucho gusto le ayudo 😊 ¿Me podría indicar la marca, el modelo y qué problema está presentando el equipo?";
    }

    return "Gracias por la información 😊 Para ayudarle mejor, ¿me podría confirmar la marca y el modelo del equipo?";
  }

  if (strategy === "QUALIFY") {
    if (!known_data.use_case) {
      return "Con mucho gusto le ayudo 😊 ¿La necesita para estudio, trabajo o algún uso específico?";
    }

    if (!known_data.budget) {
      return "Perfecto 😊 ¿Qué presupuesto aproximado tiene pensado para recomendarle una opción más adecuada?";
    }

    return "Perfecto 😊 ¿Hay alguna característica importante para usted?";
  }

  if (strategy === "EXPLAIN") {
    return "Con mucho gusto le ayudo 😊 ¿Me podría indicar un poco más sobre lo que desea validar para orientarle mejor?";
  }

  if (strategy === "EXPLAIN_CLOSE") {
    return "Perfecto 😊 Ya con esa información le puedo orientar mejor. Si gusta, le ayudo a coordinar el siguiente paso.";
  }

  if (strategy === "RECOMMEND") {
    if (products.length > 0) {
      const first = products[0];
      const price = normalizePrice(first);

      if (price > 0) {
        return `Le podría recomendar ${first.name} por ₡${price.toLocaleString("es-CR")} 😊 ¿Desea que le comparta más detalles o fotos reales?`;
      }

      return `Le podría recomendar ${first.name} 😊 ¿Desea que le comparta más detalles o fotos reales?`;
    }

    if (!known_data.budget) {
      return "Perfecto 😊 Ya con esa información le puedo recomendar opciones. ¿Qué presupuesto aproximado tiene pensado?";
    }

    return "Perfecto 😊 Ya tengo una idea más clara. ¿Desea que le comparta una opción recomendada y sus detalles?";
  }

  if (strategy === "CLOSE") {
    return "Perfecto 😊 Si gusta le ayudo a avanzar con la compra. ¿Prefiere envío, entrega o retiro?";
  }

  if (strategy === "FOLLOWUP") {
    return "Hola 😊 Solo le escribo para confirmar si todavía le interesa y con gusto le ayudo a continuar.";
  }

  return "Con mucho gusto le ayudo 😊 ¿En qué le puedo ayudar hoy?";
}

function enforceQuestionIfNeeded(text, context) {
  const clean = safe(text);

  if (!clean) return clean;

  const needsQuestion =
    context?.strategy === "ASK" ||
    context?.strategy === "QUALIFY" ||
    context?.stage === "EARLY" ||
    context?.stage === "QUALIFYING";

  if (!needsQuestion) return clean;
  if (clean.includes("¿")) return clean;

  if (context?.strategy === "ASK") {
    return `${clean} ¿Me podría indicar un poco más sobre su caso?`;
  }

  if (context?.known_data?.use_case && !context?.known_data?.budget) {
    return `${clean} ¿Qué presupuesto aproximado tiene pensado?`;
  }

  return `${clean} ¿Me podría confirmar un poco más sobre lo que necesita?`;
}

function enforceCloseActionIfNeeded(text, context) {
  const clean = safe(text);

  if (!clean) return clean;
  if (context?.strategy !== "CLOSE") return clean;

  if (
    hasAny(clean, [
      "envio",
      "envío",
      "retiro",
      "entrega",
      "apartar",
      "apartado",
      "compra",
      "coordinar",
    ])
  ) {
    return clean;
  }

  return `${clean} ¿Prefiere envío, entrega o retiro?`;
}

function applyAntiDump(text, context) {
  const clean = clampText(text, 340);

  if (!clean) return clean;

  if (context?.stage === "EARLY") {
    return clampText(clean, 220);
  }

  if (context?.stage === "QUALIFYING") {
    return clampText(clean, 260);
  }

  return clean;
}

function finalizeReply(rawReply, context, products = []) {
  const formatted = formatAIResponse({
    text: rawReply,
    agentName: context?.assistant?.name || "Eva",
  });

  if (!formatted) {
    return buildFallbackReply(context, products);
  }

  let clean = clampText(formatted, 320);
  clean = enforceCloseActionIfNeeded(clean, context);
  clean = enforceQuestionIfNeeded(clean, context);
  clean = applyAntiDump(clean, context);

  return clampText(clean, 340);
}

/*
====================================================
EXECUTION
====================================================
*/

async function executeStrategy(context) {
  let catalogResults = [];

 if (shouldSearchCatalog(context)) {
    try {
      const products = await searchCatalog({
        organization_id: context.organization.id,
        text: context.user_message,
      });

      catalogResults = (products || []).map((p) => ({
        ...p,
        price: normalizePrice(p),
        currency: "CRC",
      }));
    } catch (err) {
      console.error("❌ catalog search error:", err);
    }
  }

  /*
  ========================================
  DETERMINISTIC FIRST IF AI NOT NEEDED
  ========================================
  */

  if (!shouldUseAI(context)) {
    const fallback = buildFallbackReply(context, catalogResults);

    return {
      reply: fallback,
      catalogResults,
      source: "deterministic_fallback",
      ai_confidence: null,
      ai_stage: context.stage,
      ai_intent: context.intent,
    };
  }

  /*
  ========================================
  PROMPT CONFIG
  ========================================
  */

  const promptConfig = await getPromptConfig(context.organization.id);
  context.prompt_config = isObject(promptConfig) ? promptConfig : {};

  /*
  ========================================
  PROMPT
  ========================================
  */

  const prompt = buildPrompt({
    context: {
      ...context,
      stage: lower(context.stage),
    },
    catalogResults,
    history: context.history || [],
    promptConfig: context.prompt_config,
  });

  /*
  ========================================
  AI ENGINE
  ========================================
  */

  let aiResult = null;

  try {
    aiResult = await runAI({
      prompt: buildAIMessages(prompt),
    });
  } catch (err) {
    console.error("❌ AI ENGINE ERROR:", err);
  }

  const aiEnvelope = normalizeAIResult(aiResult, context, catalogResults);

  let reply = aiEnvelope.reply || null;

  /*
  ========================================
  PRODUCT ENHANCEMENT
  ========================================
  */

  if (context.strategy === "RECOMMEND" || context.strategy === "CLOSE") {
  reply = enhanceProductReply({
    reply,
    intent: context.intent,
    catalogMatches: catalogResults,
    data: context.sales_context,
  });
}

  const finalAiEnvelope = {
    ...aiEnvelope,
    reply,
  };

  /*
  ========================================
  FINAL DECISION
  ========================================
  */

  if (!shouldAcceptAIReply(finalAiEnvelope, context, catalogResults)) {
    const fallback = buildFallbackReply(context, catalogResults);

    return {
      reply: fallback,
      catalogResults,
      source: aiResult ? "fallback_after_ai_gate" : "fallback_after_ai_fail",
      ai_confidence: finalAiEnvelope.confidence,
      ai_stage: finalAiEnvelope.stage,
      ai_intent: finalAiEnvelope.intent,
    };
  }

  /*
  ========================================
  FINAL CLEAN
  ========================================
  */

  const finalReply = finalizeReply(reply, context, catalogResults);

  return {
    reply: finalReply,
    catalogResults,
    source: "ai",
    ai_confidence: finalAiEnvelope.confidence,
    ai_stage: finalAiEnvelope.stage,
    ai_intent: finalAiEnvelope.intent,
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
    const channel = safe(payload?.channel || "whatsapp");
    const message_id = safe(payload?.message_id) || null;

    if (!organization_id || !phone || !text) {
      throw new Error("Missing inbound data");
    }

    /*
    ========================================
    BASE ENTITIES
    ========================================
    */

    const lead = await findOrCreateLead({ organization_id, phone });

    const conversation = await findOrCreateConversation({
      organization_id,
      phone,
      channel,
    });

    if (!conversation?.id) {
      throw new Error("Conversation not created");
    }

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "user",
      text,
      message_id,
    });

    /*
    ========================================
    INTENT + HEURISTICS
    ========================================
    */

    const rawIntent = detectIntent(text);
    const intent = normalizeIntent(rawIntent);

    const detectedKnownData = buildKnownData(text);
    // 🔥 evitar contaminación entre intents
if (intent === "SERVICE") {
  detectedKnownData.product_interest = null;
}

if (intent === "BUY") {
  detectedKnownData.problem = null;
}
    const detectedStage = detectStage({
      intent,
      text,
      known_data: detectedKnownData,
    });

    /*
    ========================================
    CONTEXT BUILDER
    ========================================
    */

    const rawContext = await buildContext({
      organization_id,
      phone,
      text,
      intent,
      stage: detectedStage,
      known_data: detectedKnownData,
    });

    const context = ensureContextShape(rawContext, {
      organization_id,
      user_message: text,
      intent,
      stage: detectedStage,
      known_data: detectedKnownData,
    });

    assertContextReady(context);

    /*
    ========================================
    STRATEGY ENFORCEMENT
    ========================================
    */

    const strategyDecision = decideStrategy({
  intent: context.intent,
  stage: context.stage,
  known_data: context.known_data,
  sales_context: context.sales_context,
  signals: context.signals,
});

    const normalizedDecision = normalizeStrategyDecision(strategyDecision, {
      intent: context.intent,
      stage: context.stage,
      known_data: context.known_data,
    });

    if (!normalizedDecision?.strategy) {
      throw new Error("Strategy required");
    }

    context.strategy = normalizedDecision.strategy;
    context.strategy_meta = normalizedDecision;

    console.log("🧠 BLOCK5.1 EXECUTION", {
      intent: context.intent,
      stage: context.stage,
      strategy: context.strategy,
      known_data: context.known_data,
    });

    /*
    ========================================
    EXECUTION
    ========================================
    */

    const execution = await executeStrategy(context);

    const finalReply = clampText(
      execution?.reply || buildFallbackReply(context),
      340
    );

    /*
    ========================================
    SAVE ASSISTANT MESSAGE
    ========================================
    */

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      text: finalReply,
    });

    /*
    ========================================
    FOLLOWUP
    ========================================
    */

    if (intent === "BUY" || intent === "INFO" || intent === "SERVICE") {
      try {
        await scheduleFollowup({
          organization_id,
          lead_id: lead?.id || null,
          phone,
          conversation_id: conversation.id,
          delay_hours: 24,
          reason: "sales_followup",
        });
      } catch (err) {
        console.error("❌ followup error:", err);
      }
    }

    return {
      reply: { text: finalReply },
      meta: {
        intent: context.intent,
        stage: context.stage,
        strategy: context.strategy,
        source: execution?.source || "unknown",
        ai_confidence:
          execution?.ai_confidence !== undefined ? execution.ai_confidence : null,
        ai_stage: execution?.ai_stage || context.stage,
        ai_intent: execution?.ai_intent || context.intent,
        known_data: {
          budget: context.known_data?.budget || null,
          use_case: context.known_data?.use_case || null,
          problem: normalizeTextForMemory(context.known_data?.problem),
          product_interest: context.known_data?.product_interest || null,
        },
      },
    };
  } catch (err) {
    console.error("❌ HANDLE INBOUND ERROR:", err);

    return {
      reply: {
        text: "Con mucho gusto le ayudo 😊 ¿Me podría repetir su consulta, por favor?",
      },
      meta: {
        source: "error_fallback",
      },
    };
  }
}

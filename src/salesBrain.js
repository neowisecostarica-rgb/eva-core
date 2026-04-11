/*
====================================================
EVA CORE — SALES BRAIN (BLOCK 5 — AI CONTROLLED)
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

import { searchCatalogSmart } from "./brain/commerce/catalogEngine.js";
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

function detectStage({ intent, text, known_data = {} }) {
  const t = lower(text);

  const hasBudget = !!known_data.budget;
  const hasUseCase = !!known_data.use_case;
  const hasProblem = !!known_data.problem;

  if (intent === "SERVICE") {
    return hasProblem ? "QUALIFYING" : "EARLY";
  }

  if (
    hasAny(t, [
      "me interesa",
      "precio",
      "cuánto cuesta",
      "cuanto cuesta",
      "disponible",
      "garantia",
      "garantía",
      "fotos",
      "especificaciones",
      "info",
      "informacion",
      "información",
    ])
  ) {
    if (hasBudget && hasUseCase) return "MID";
    return "QUALIFYING";
  }

  if (
    hasAny(t, [
      "me la deja",
      "me lo deja",
      "la compro",
      "lo compro",
      "quiero comprar",
      "apartar",
      "reservar",
      "envio",
      "envío",
      "retiro",
      "donde estan",
      "dónde están",
      "ubicacion",
      "ubicación",
      "pago",
      "sinpe",
      "transferencia",
      "tarjeta",
    ])
  ) {
    return "HOT";
  }

  if (intent === "GREETING") return "EARLY";
  if (hasUseCase || hasBudget) return "QUALIFYING";

  return "EARLY";
}

/*
====================================================
AI CONTROL
====================================================
*/

function shouldSearchCatalog(strategy) {
  return strategy === "RECOMMEND" || strategy === "CLOSE";
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

    return "Perfecto 😊 Ya con esa información le puedo recomendar opciones. ¿Qué presupuesto aproximado tiene pensado?";
  }

  if (strategy === "CLOSE") {
    return "Perfecto 😊 Si gusta le ayudo a avanzar con la compra. ¿Prefiere envío, entrega o retiro?";
  }

  if (strategy === "FOLLOWUP") {
    return "Hola 😊 Solo le escribo para confirmar si todavía le interesa y con gusto le ayudo a continuar.";
  }

  return "Con mucho gusto le ayudo 😊 ¿En qué le puedo ayudar hoy?";
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

  // Si es cierre y no empuja acción, empujarlo
  if (
    context?.strategy === "CLOSE" &&
    !hasAny(clean, ["envio", "envío", "retiro", "entrega", "apartar", "compra"])
  ) {
    clean += " ¿Prefiere envío, entrega o retiro?";
  }

  // Si es qualify y no pregunta nada, forzar pregunta
  if (
    (context?.strategy === "QUALIFY" || context?.strategy === "ASK") &&
    !clean.includes("¿")
  ) {
    clean += " ¿Me podría confirmar un poco más sobre lo que necesita?";
  }

  return clampText(clean, 340);
}

/*
====================================================
EXECUTION
====================================================
*/

async function executeStrategy(context) {
  let catalogResults = [];

  if (shouldSearchCatalog(context.strategy)) {
    try {
      const products = await searchCatalogSmart({
        organization_id: context.organization.id,
        query: context.user_message,
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
  DETerministic first if AI not needed
  ========================================
  */

  if (!shouldUseAI(context)) {
    const fallback = buildFallbackReply(context, catalogResults);

    return {
      reply: fallback,
      catalogResults,
      source: "deterministic_fallback",
    };
  }

  /*
  ========================================
  PROMPT CONFIG
  ========================================
  */

  const promptConfig = await getPromptConfig(context.organization.id);

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
    promptConfig,
  });

  /*
  ========================================
  AI ENGINE
  ========================================
  */

  const aiResult = await runAI({
    prompt: buildAIMessages(prompt),
  });

  let reply = aiResult?.text || null;

  /*
  ========================================
  PRODUCT ENHANCEMENT
  ========================================
  */

  reply = enhanceProductReply({
    reply,
    intent: context.intent,
    catalogMatches: catalogResults,
    data: context.sales_context,
  });

  /*
  ========================================
  FINAL CLEAN
  ========================================
  */

  const finalReply = finalizeReply(reply, context, catalogResults);

  return {
    reply: finalReply,
    catalogResults,
    source: aiResult ? "ai" : "fallback_after_ai_fail",
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

    const context = await buildContext({
      organization_id,
      phone,
      text,
      intent,
      stage: detectedStage,
      known_data: detectedKnownData,
    });

    /*
    ========================================
    STRATEGY
    ========================================
    */

    const strategyDecision = decideStrategy({
      intent: context.intent,
      stage: context.stage,
      known_data: context.known_data,
    });

    context.strategy = strategyDecision?.strategy || "ASK";

    console.log("🧠 BLOCK5 EXECUTION", {
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

    if (
      intent === "BUY" ||
      intent === "INFO" ||
      intent === "SERVICE"
    ) {
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
      },
    };
  } catch (err) {
    console.error("❌ HANDLE INBOUND ERROR:", err);

    return {
      reply: {
        text: "Con mucho gusto le ayudo 😊 ¿Me podría repetir su consulta, por favor?",
      },
    };
  }
}

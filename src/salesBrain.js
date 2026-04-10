/*
====================================================
EVA CORE — SALES BRAIN (P1.3.4 — BLOCK 1 FIXED)
====================================================
*/

import db, {
  getOrganizationSettings,
  findOrCreateLead,
  findOrCreateConversation,
  saveMessage,
  savePipelineEvent,
  updateLeadStageAndScore,
  updateLeadMemory,
} from "./db.js";

import { matchHotSignals, getHotSignals } from "./brain/utils/intentSignals.js";
import { searchCatalogSmart } from "./brain/utils/catalogEngine.js";
import { generateReply } from "./brain/replies/replyEngine.js";
import { enforceAIRuntime } from "./system/contracts/aiRuntime.js";
import { runAI } from "./brain/engines/aiEngine.js";
import { applyAIGuards } from "./brain/utils/aiGuards.js";
import { buildPrompt } from "./brain/utils/promptBuilder.js";
import { getPromptConfig } from "./brain/utils/getPromptConfig.js";
import { detectIntent } from "./brain/engines/intentEngine.js";
import { formatAIResponse } from "./brain/utils/responseFormatter.js";
import {
  decideStrategy,
  normalizeIntent as normalizeStrategyIntent,
  normalizeStage as normalizeStrategyStage,
} from "./brain/engines/strategyEngine.js";

/*
====================================================
🔴 STRATEGY ENFORCEMENT
====================================================
*/

function enforceStrategyRequired(strategy, context = {}) {
  if (!strategy || typeof strategy !== "string" || strategy === "DEFAULT") {
    console.error("❌ INVALID STRATEGY", {
      strategy,
      context,
    });

    throw new Error("EVA no puede responder sin una strategy válida");
  }

  return strategy;
}

/*
====================================================
HELPERS
====================================================
*/

function normalizeIntent(intent) {
  if (!intent) return "OTHER";
  const clean = String(intent).toUpperCase().trim();

  if (["BUY", "PURCHASE"].includes(clean)) return "BUY";
  if (["INFO", "QUESTION"].includes(clean)) return "INFO";
  if (["SUPPORT", "HELP", "SERVICE"].includes(clean)) return "SERVICE";
  if (["GREETING", "HELLO"].includes(clean)) return "GREETING";
  if (["FOLLOWUP"].includes(clean)) return "FOLLOWUP";
  if (["CLOSE_INTENT"].includes(clean)) return "CLOSE_INTENT";
  return "OTHER";
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function extractBudget(text = "", lead = {}) {
  if (hasValue(lead?.budget)) return lead.budget;

  const t = String(text || "").toLowerCase();

  const currencyMatch =
    t.match(/₡\s?([\d.,]+)/) ||
    t.match(/crc\s?([\d.,]+)/i) ||
    t.match(/colones?\s?([\d.,]+)/i);

  if (currencyMatch?.[1]) {
    const normalized = currencyMatch[1].replace(/[.,]/g, "");
    const parsed = Number(normalized);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }

  const bareMatch = t.match(/\b(\d{5,8})\b/);
  if (bareMatch?.[1]) {
    const parsed = Number(bareMatch[1]);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }

  return null;
}

function extractUseCase(text = "", lead = {}) {
  if (hasValue(lead?.use_case)) return lead.use_case;

  const t = String(text || "").toLowerCase();

  if (t.includes("estudio") || t.includes("colegio") || t.includes("universidad")) {
    return "estudio";
  }

  if (
    t.includes("trabajo") ||
    t.includes("oficina") ||
    t.includes("empresa") ||
    t.includes("excel")
  ) {
    return "trabajo";
  }

  if (
    t.includes("diseño") ||
    t.includes("edición") ||
    t.includes("arquitectura") ||
    t.includes("render")
  ) {
    return "creativo";
  }

  if (t.includes("gaming") || t.includes("jugar") || t.includes("juegos")) {
    return "gaming";
  }

  return null;
}

function extractProductInterest(text = "", lead = {}) {
  if (hasValue(lead?.product_interest)) return lead.product_interest;

  const t = String(text || "").toLowerCase();

  if (t.includes("laptop") || t.includes("portátil") || t.includes("portatil")) {
    return "laptop";
  }

  if (t.includes("computadora") || t.includes("pc")) {
    return "computadora";
  }

  if (t.includes("impresora")) {
    return "impresora";
  }

  if (t.includes("monitor")) {
    return "monitor";
  }

  if (t.includes("teclado numerico") || t.includes("teclado numérico")) {
    return "laptop_con_numpad";
  }

  return null;
}

function extractProblem(text = "", lead = {}) {
  if (hasValue(lead?.problem)) return lead.problem;

  const t = String(text || "").toLowerCase();

  if (
    t.includes("no sirve") ||
    t.includes("error") ||
    t.includes("mantenimiento") ||
    t.includes("repar") ||
    t.includes("no imprime") ||
    t.includes("no enciende") ||
    t.includes("falla") ||
    t.includes("lenta")
  ) {
    return text;
  }

  return null;
}

function extractBrand(text = "", lead = {}) {
  if (hasValue(lead?.brand)) return lead.brand;

  const t = String(text || "").toLowerCase();

  if (t.includes("hp")) return "HP";
  if (t.includes("epson")) return "Epson";
  if (t.includes("brother")) return "Brother";
  if (t.includes("lenovo")) return "Lenovo";
  if (t.includes("dell")) return "Dell";
  if (t.includes("asus")) return "Asus";
  if (t.includes("acer")) return "Acer";
  if (t.includes("apple") || t.includes("macbook")) return "Apple";

  return null;
}

function extractUrgency(text = "", lead = {}) {
  if (hasValue(lead?.urgency)) return lead.urgency;

  const t = String(text || "").toLowerCase();

  if (
    t.includes("hoy") ||
    t.includes("urgente") ||
    t.includes("ya") ||
    t.includes("ahora") ||
    t.includes("de una")
  ) {
    return "high";
  }

  if (t.includes("esta semana") || t.includes("pronto")) {
    return "medium";
  }

  return null;
}

function buildKnownData({ text = "", lead = {} }) {
  return {
    budget: extractBudget(text, lead),
    use_case: extractUseCase(text, lead),
    product_interest: extractProductInterest(text, lead),
    problem: extractProblem(text, lead),
    brand: extractBrand(text, lead),
    urgency: extractUrgency(text, lead),
    product_type: extractProductInterest(text, lead),
  };
}

function detectStage({ intent, lead = {}, text = "", knownData = {} }) {
  const t = String(text || "").toLowerCase();
  const currentStage = normalizeStrategyStage(lead?.stage || "new");
  const hotSignals = getHotSignals({});
  const hasHotSignal = matchHotSignals(t, hotSignals);

  if (
    intent === "CLOSE_INTENT" ||
    hasHotSignal ||
    t.includes("como pago") ||
    t.includes("sinpe") ||
    t.includes("transferencia") ||
    t.includes("tarjeta") ||
    t.includes("apartar") ||
    t.includes("reservar")
  ) {
    return "hot";
  }

  if (intent === "FOLLOWUP") {
    return currentStage === "new" ? "qualifying" : currentStage;
  }

  if (intent === "SERVICE") {
    if (hasValue(knownData.problem) || hasValue(knownData.brand)) {
      return "qualifying";
    }
    return currentStage === "new" ? "new" : currentStage;
  }

  if (intent === "BUY") {
    const hasCommercialData =
      hasValue(knownData.budget) ||
      hasValue(knownData.use_case) ||
      hasValue(knownData.product_interest);

    if (currentStage === "hot" || currentStage === "closing") {
      return "hot";
    }

    if (hasCommercialData) {
      return "qualifying";
    }

    return "new";
  }

  if (intent === "INFO") {
    if (currentStage === "hot") return "hot";
    return currentStage === "new" ? "qualifying" : currentStage;
  }

  if (intent === "GREETING") {
    return currentStage;
  }

  return currentStage;
}

function calculateLeadScore({ intent, stage, knownData = {}, text = "" }) {
  let score = 20;
  const t = String(text || "").toLowerCase();

  if (intent === "GREETING") score = 25;
  if (intent === "INFO") score = 40;
  if (intent === "BUY") score = 60;
  if (intent === "SERVICE") score = 55;
  if (intent === "FOLLOWUP") score = 65;
  if (intent === "CLOSE_INTENT") score = 90;

  if (hasValue(knownData.budget)) score += 10;
  if (hasValue(knownData.use_case)) score += 10;
  if (hasValue(knownData.product_interest)) score += 10;
  if (hasValue(knownData.problem)) score += 5;
  if (hasValue(knownData.urgency)) score += 5;

  if (
    t.includes("como pago") ||
    t.includes("sinpe") ||
    t.includes("transferencia") ||
    t.includes("tarjeta") ||
    t.includes("apartar") ||
    t.includes("reservar")
  ) {
    score = Math.max(score, 90);
  }

  if (stage === "hot") score = Math.max(score, 85);
  if (stage === "closing") score = Math.max(score, 90);

  return Math.min(score, 100);
}

function buildFallback({ intent, strategy }) {
  if (intent === "SERVICE" && strategy === "ASK") {
    return "Hola 😊 con mucho gusto le ayudo. ¿Me podría indicar la marca, el modelo y qué problema está presentando el equipo?";
  }

  if (intent === "BUY" && strategy === "QUALIFY") {
    return "Hola 😊 con mucho gusto le ayudo. ¿La necesita para estudio, trabajo o algún uso específico?";
  }

  if (intent === "INFO") {
    return "Hola 😊 con mucho gusto le ayudo. ¿Qué información le gustaría conocer exactamente?";
  }

  if (intent === "FOLLOWUP") {
    return "Hola 😊 con mucho gusto le doy seguimiento. ¿Desea que continuemos con la opción que estaba valorando?";
  }

  if (strategy === "CLOSE") {
    return "Perfecto 😊 con mucho gusto le ayudo a coordinar el siguiente paso. ¿Prefiere entrega, envío o retiro?";
  }

  return "Hola 😊 con mucho gusto le ayudo. ¿En qué le puedo ayudar?";
}

/*
====================================================
MAIN
====================================================
*/

export async function handleInbound(payload) {
  const { context = {} } = payload;

  try {
    const { organization_id, phone, text, channel, message_id } = payload;

    let safeCatalog = [];
    let promptConfig = null;
    let orgSettings = null;

    try {
      promptConfig = await getPromptConfig(organization_id);
    } catch {}

    try {
      orgSettings = await getOrganizationSettings(organization_id);
    } catch {}

    const orgContext = {
      business_name:
        context?.organization?.business_name ||
        promptConfig?.business_name ||
        orgSettings?.business_name ||
        "el negocio",

      assistant_name:
        context?.assistant?.name ||
        promptConfig?.agent_name ||
        promptConfig?.assistant_name ||
        orgSettings?.assistant_name ||
        "Asistente",

      tone:
        context?.assistant?.tone ||
        promptConfig?.tone ||
        orgSettings?.tone ||
        "profesional",
    };

    const lead = await findOrCreateLead({ organization_id, phone });

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
      message_id,
    });

    const historyRes = await db.query(
      `
      SELECT role, content AS text
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
      LIMIT 10
      `,
      [conversation.id]
    );

    const history = historyRes.rows || [];
    const t = String(text || "").toLowerCase();

    let refinedIntent = normalizeIntent(detectIntent(text));
    refinedIntent = normalizeStrategyIntent(refinedIntent);

    // ================================
    // AJUSTES INTENT
    // ================================
    if (refinedIntent === "OTHER" && history.length > 1) {
      refinedIntent = "FOLLOWUP";
    }

    if (refinedIntent === "INFO" && t.includes("precio")) {
      refinedIntent = "BUY";
    }

    if (
      t.includes("no sirve") ||
      t.includes("error") ||
      t.includes("mantenimiento") ||
      t.includes("repar")
    ) {
      refinedIntent = "SERVICE";
    }

    // ================================
    // CORE FLOW (ORDEN CORRECTO)
    // ================================
    const knownData = buildKnownData({ text, lead });

    const stage = detectStage({
      intent: refinedIntent,
      lead,
      text,
      knownData,
    });

    const normalizedStage = normalizeStrategyStage(stage);

    const strategyDecision = decideStrategy({
      intent: refinedIntent,
      stage: normalizedStage,
      known_data: knownData,
    });

    // 🔴 ENFORCE PRIMERO
    const enforcedStrategy = enforceStrategyRequired(strategyDecision?.strategy, {
      intent: refinedIntent,
      stage: normalizedStage,
      knownData,
      strategyDecision,
    });

    // 🔴 USAR CONTEXTO YA CONSTRUIDO DESDE AFUERA
    const inboundContext = {
      ...context,
      intent: refinedIntent,
      stage: normalizedStage,
      known_data: knownData,
      channel,
    };

    // ================================
    // CATALOGO
    // ================================
    const shouldSearchCatalog =
      refinedIntent === "BUY" ||
      refinedIntent === "INFO" ||
      refinedIntent === "CLOSE_INTENT";

    if (shouldSearchCatalog) {
      try {
        const results = await searchCatalogSmart({
          organization_id,
          query: text,
        });

        safeCatalog = (results || []).slice(0, 3);
      } catch {}
    }

    // ================================
    // AI
    // ================================
    let aiText = null;

    if (enforcedStrategy) {
      const prompt = buildPrompt({
        context: {
          ...inboundContext,
          intent: refinedIntent,
          stage: normalizedStage.toUpperCase(),
          known_data: knownData,
          strategy: enforcedStrategy,
          organization: {
            business_name: orgContext.business_name,
            assistant_name: orgContext.assistant_name,
            tone: orgContext.tone,
          },
        },
        catalogResults: safeCatalog,
        history,
        promptConfig,
      });

      const aiResult = await runAI({
        prompt: [{ role: "system", content: prompt }],
      });

      enforceAIRuntime({ aiResponse: aiResult });

      const guarded = applyAIGuards({ aiResponse: aiResult });

      if (guarded?.text) {
        aiText = formatAIResponse({
          text: guarded.text,
          agentName: orgContext.assistant_name,
        });
      }
    }

    // ================================
    // FALLBACK
    // ================================
    const fallback = buildFallback({
      intent: refinedIntent,
      strategy: enforcedStrategy,
    });

    const replyText = !aiText || aiText.length < 5 ? fallback : aiText;

    const reply = generateReply({
      text: replyText,
      intent: refinedIntent,
      products: safeCatalog,
    });

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      text: reply.text,
    });

    // ================================
    // MEMORY / STAGE / PIPELINE
    // ================================
    const leadScore = calculateLeadScore({
      intent: refinedIntent,
      stage: normalizedStage,
      knownData,
      text,
    });

    try {
      await updateLeadMemory({
        organization_id,
        lead_id: lead?.id,
        memory: {
          budget: knownData.budget,
          use_case: knownData.use_case,
          product_interest: knownData.product_interest,
          problem: knownData.problem,
          brand: knownData.brand,
          urgency: knownData.urgency,
          last_intent: refinedIntent,
          last_strategy: enforcedStrategy,
        },
      });
    } catch (memoryError) {
      console.error("❌ UPDATE LEAD MEMORY ERROR:", memoryError);
    }

    try {
      await updateLeadStageAndScore({
        organization_id,
        lead_id: lead?.id,
        new_stage: normalizedStage,
        new_score: leadScore,
      });
    } catch (stageError) {
      console.error("❌ UPDATE LEAD STAGE ERROR:", stageError);
    }

    try {
      await savePipelineEvent({
        organization_id,
        lead_id: lead?.id,
        event_type: "inbound_processed",
        metadata: {
          intent: refinedIntent,
          stage: normalizedStage,
          strategy: enforcedStrategy,
          strategy_reason: strategyDecision?.reason || null,
          lead_score: leadScore,
          conversation_id: conversation.id,
          has_catalog_results: safeCatalog.length > 0,
        },
      });
    } catch (pipelineError) {
      console.error("❌ PIPELINE EVENT ERROR:", pipelineError);
    }

    return {
      reply,
      meta: {
        intent: refinedIntent,
        stage: normalizedStage,
        strategy: enforcedStrategy,
        strategy_reason: strategyDecision?.reason || null,
        lead_score: leadScore,
        lead_id: lead?.id || null,
        conversation_id: conversation.id,
      },
    };
  } catch (err) {
    console.error("❌ SALES BRAIN ERROR:", err);

    return {
      reply: {
        text: "Hubo un problema procesando tu solicitud.",
      },
      meta: {
        error: true,
      },
    };
  }
}

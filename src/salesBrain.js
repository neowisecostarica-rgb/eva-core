/*
====================================================
EVA CORE — SALES BRAIN (P1.3.3 — ENFORCE + CONTEXT FIXED)
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
import { buildContext } from "./contextBuilder.js";

/*
====================================================
🔴 STRATEGY ENFORCEMENT
====================================================
*/

function enforceStrategyRequired(strategy, context = {}) {
  if (!strategy || strategy === "DEFAULT") {
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

    const strategy = decideStrategy({
      intent: refinedIntent,
      stage,
      known_data: knownData,
    });

    // 🔴 ENFORCE PRIMERO
    const enforcedStrategy = enforceStrategyRequired(strategy, {
      intent: refinedIntent,
      stage,
      knownData,
    });

    // 🔴 CONTEXT DESPUÉS
    const fullContext = await buildContext({
      organization_id,
      phone,
      text,
      intent: refinedIntent,
      stage,
      known_data: knownData,
    });

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
          ...fullContext,
          strategy: enforcedStrategy,
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
    const fallback = `Hola 😊 con mucho gusto le ayudo. ¿En qué le puedo ayudar?`;

    const replyText =
      !aiText || aiText.length < 5 ? fallback : aiText;

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

    return {
      reply,
      meta: {
        intent: refinedIntent,
        stage,
        strategy: enforcedStrategy,
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
    };
  }
}

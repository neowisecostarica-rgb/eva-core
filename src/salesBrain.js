/*
====================================================
EVA CORE — SALES BRAIN
(BASELINE ESTABLE + AI + CATALOG + PIPELINE)
====================================================
*/

import {
  findOrCreateLead,
  findOrCreateConversation,
  saveMessage,
} from "./db.js";

import db from "./db.js";

import { searchCatalogSmart } from "./brain/utils/catalogEngine.js";
import { generateReply } from "./brain/replies/replyEngine.js";

import { enforceAIRuntime } from "./system/contracts/aiRuntime.js";
import { runAI } from "./brain/engines/aiEngine.js";
import { applyAIGuards } from "./brain/utils/aiGuards.js";
import { buildPrompt } from "./brain/utils/promptBuilder.js";
import { getPromptConfig } from "./brain/utils/getPromptConfig.js";

import { detectPipelineEvent } from "./brain/engines/pipelineEngine.js";
import { detectIntent } from "./brain/engines/intentEngine.js";

/*
====================================================
NORMALIZERS
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

  return clean;
}

function normalizeStage(stage) {
  const safeStage = String(stage || "new").toLowerCase();

  if (safeStage === "new" || safeStage === "early") return "new";
  if (safeStage === "qualifying") return "qualifying";
  if (safeStage === "consideration" || safeStage === "mid") return "consideration";
  if (safeStage === "hot" || safeStage === "ready_to_buy") return "hot";
  if (safeStage === "closing") return "closing";
  if (safeStage === "post") return "post";

  return "new";
}

function decideStrategy({ intent, stage, known_data = {} }) {
  try {
    // SERVICE FLOW
    if (intent === "SERVICE" && !known_data.problem) {
      return "ASK";
    }

    if (intent === "SERVICE" && known_data.problem) {
      return "EXPLAIN_CLOSE";
    }

    // BUY FLOW
    if (intent === "BUY" && stage === "EARLY") {
      return "QUALIFY";
    }

    if (intent === "BUY" && stage === "MID") {
      return "RECOMMEND";
    }

    if (intent === "BUY" && stage === "HOT") {
      return "CLOSE";
    }

    // FOLLOWUP
    if (intent === "FOLLOWUP") {
      return "FOLLOWUP";
    }

    return "DEFAULT";

  } catch (error) {
    console.error("❌ Strategy Engine Error:", error);
    return "DEFAULT";
  }
}

/*
====================================================
CATALOG HELPERS
====================================================
*/

function filterCatalogResults(results = []) {
  if (!Array.isArray(results)) return [];
  return results.filter((p) => p && p.is_active !== false);
}

/*
====================================================
CATALOG DECISION (FIXED)
====================================================
*/

function decideCatalogUsage({ strategy, intent, stage, text }) {
  const safeIntent = normalizeIntent(intent);
  const safeStage = normalizeStage(stage);
  const safeStrategy = String(strategy || "").toUpperCase();
  const t = String(text || "").toLowerCase();

  if (safeIntent === "BUY") return true;

  if (
    t.includes("que tienes") ||
    t.includes("qué tienes") ||
    t.includes("productos") ||
    t.includes("laptop") ||
    t.includes("computadora")
  ) return true;

  if (safeIntent === "SERVICE") return true;

  if (safeStrategy === "RECOMMEND") return true;
  if (safeStrategy === "CLOSE") return true;

  if (safeStage === "consideration" && safeIntent === "BUY") return true;

  return false;
}

/*
====================================================
MAIN
====================================================
*/

export async function handleInbound(payload) {
  try {
    const { organization_id, phone, text, channel, message_id } = payload;

    let safeCatalog = []; // 🔥 FIX CRÍTICO

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
      `SELECT role, content AS text FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 10`,
      [conversation.id]
    );

    const history = historyRes.rows || [];

    const rawIntent = detectIntent(text);
    const intent = normalizeIntent(rawIntent);
    
const strategy = decideStrategy({ intent });
console.log("🧠 STRATEGY:", strategy);
    const strategy = "ASK"; // 🔒 estable por ahora

    const shouldUseCatalog = decideCatalogUsage({
      strategy,
      intent,
      stage: lead.stage,
      text,
    });

    if (shouldUseCatalog) {
      try {
        const rawResults = await searchCatalogSmart({
          organization_id,
          query: text,
        });

        const filtered = filterCatalogResults(rawResults);
        safeCatalog = filtered.slice(0, 3);
      } catch (err) {
        console.warn("Catalog error:", err);
      }
    }

    let aiText = null;

    try {
      const prompt = buildPrompt({
        context: { intent },
        catalogResults: safeCatalog,
        history,
      });

      const aiResult = await runAI({ prompt });

      enforceAIRuntime({ aiResponse: aiResult });

      const guarded = applyAIGuards({ aiResponse: aiResult });

      if (guarded?.text) aiText = guarded.text;
    } catch (err) {
      console.warn("AI error:", err);
    }

    const replyText =
      aiText ||
      "Hola 😊 con mucho gusto le ayudo. ¿Qué tipo de equipo necesita?";

    const reply = generateReply({
      text: replyText,
      intent: "AI",
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
      meta: { intent },
    };
  } catch (err) {
    console.error("❌ SALES BRAIN ERROR:", err);

    return {
      reply: {
        text: "Hubo un problema procesando el mensaje 🙏",
        media: [],
      },
      meta: { error: true },
    };
  }
}

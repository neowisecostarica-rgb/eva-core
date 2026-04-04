/*
====================================================
EVA CORE — SALES BRAIN
(BASELINE ESTABLE + AI + CATALOG + PIPELINE)
====================================================
*/
import { getOrganizationSettings } from "./db.js";

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
    if (intent === "SERVICE" && !known_data.problem) return "ASK";
    if (intent === "SERVICE" && known_data.problem) return "EXPLAIN_CLOSE";

    if (intent === "BUY" && stage === "EARLY") return "QUALIFY";
    if (intent === "BUY" && stage === "MID") return "RECOMMEND";
    if (intent === "BUY" && stage === "HOT") return "CLOSE";

    if (intent === "FOLLOWUP") return "FOLLOWUP";

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

    let safeCatalog = [];

    // ================================
    // LOAD PROMPT CONFIG (SOT)
    // ================================
    let promptConfig = null;

    try {
      promptConfig = await getPromptConfig(organization_id);
      let orgSettings = null;

try {
  orgSettings = await getOrganizationSettings(organization_id);
} catch (err) {
  console.warn("No organization settings");
}

const orgContext = {
  business_name: orgSettings?.business_name || "el negocio",
  assistant_name: orgSettings?.assistant_name || "asistente",
  tone: orgSettings?.tone || "profesional",
  style: orgSettings?.sales_style || "consultivo",
};
    

try {
  orgSettings = await getOrganizationSettings(organization_id);
  console.log("🏢 org_settings loaded:", !!orgSettings);
} catch (err) {
  console.warn("⚠️ No organization_settings found");
}
      
      console.log("🧠 prompt_config loaded:", !!promptConfig);
    } catch (err) {
      console.warn("⚠️ No prompt_config found, using defaults");
    }

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
    // ========================================
// INTENT REFINEMENT (SEMANTIC LAYER)
// ========================================

let refinedIntent = intent;

const t = String(text || "").toLowerCase();

if (refinedIntent === "INFO") {
  if (
    t.includes("precio") ||
    t.includes("cuánto") ||
    t.includes("vale") ||
    t.includes("costo")
  ) {
    refinedIntent = "BUY";
  }
}

if (refinedIntent === "GREETING") {
  if (
    t.includes("ocupo") ||
    t.includes("necesito") ||
    t.includes("busco")
  ) {
    refinedIntent = "BUY";
  }
}

if (
  t.includes("no sirve") ||
  t.includes("dañado") ||
  t.includes("fallo") ||
  t.includes("error")
) {
  refinedIntent = "SERVICE";
}
    

    const strategy = decideStrategy({
  intent: refinedIntent,
      stage: lead.stage,
    });

    console.log("🧠 STRATEGY:", strategy);

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
  context: {
    intent,
    organization: orgContext, // 🔥 AQUÍ
  },
  catalogResults: safeCatalog,
  history,
  promptConfig,
});
      

      const aiResult = await runAI({ prompt });

      enforceAIRuntime({ aiResponse: aiResult });

      const guarded = applyAIGuards({ aiResponse: aiResult });

      if (guarded?.text) aiText = guarded.text;
    } catch (err) {
      console.warn("AI error:", err);
    }

    let replyText = aiText;

    // 🔒 FALLBACK CONTROLADO POR STRATEGY
    if (!replyText) {
      if (strategy === "ASK") {
        replyText = "Hola 😊 con mucho gusto le ayudo. ¿Me podría indicar qué problema presenta el equipo?";
      }

      else if (strategy === "QUALIFY") {
        replyText = "Hola 😊 con mucho gusto le ayudo. ¿Para qué tipo de uso está buscando el equipo?";
      }

      else {
        replyText = "Hola 😊 con mucho gusto le ayudo. ¿En qué le puedo colaborar?";
      }
    }

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

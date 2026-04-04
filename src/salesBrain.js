/*
====================================================
EVA CORE — SALES BRAIN (FIXED CLEAN)
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

  return clean;
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
    // PROMPT CONFIG
    // ================================
    let promptConfig = null;

    try {
      promptConfig = await getPromptConfig(organization_id);
      console.log("🧠 prompt_config loaded:", !!promptConfig);
    } catch (err) {
      console.warn("⚠️ No prompt_config found");
    }

    // ================================
    // ORG SETTINGS (FIXED)
    // ================================
    let orgSettings = null;

    try {
      orgSettings = await getOrganizationSettings(organization_id);
      console.log("🏢 org_settings loaded:", !!orgSettings);
    } catch (err) {
      console.warn("⚠️ No organization_settings found");
    }

    const orgContext = {
      business_name: orgSettings?.business_name || "el negocio",
      assistant_name: orgSettings?.assistant_name || "asistente",
      tone: orgSettings?.tone || "profesional",
      style: orgSettings?.sales_style || "consultivo",
    };

    // ================================
    // CRM
    // ================================
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

    // ================================
    // INTENT
    // ================================
    const rawIntent = detectIntent(text);
    const intent = normalizeIntent(rawIntent);

    let refinedIntent = intent;

    const t = String(text || "").toLowerCase();

    if (refinedIntent === "INFO" && (t.includes("precio") || t.includes("cuánto"))) {
      refinedIntent = "BUY";
    }

    if (refinedIntent === "GREETING" && (t.includes("ocupo") || t.includes("busco"))) {
      refinedIntent = "BUY";
    }

    if (t.includes("no sirve") || t.includes("error")) {
      refinedIntent = "SERVICE";
    }

    const strategy = "DEFAULT";

    // ================================
    // CATALOG
    // ================================
    try {
      const rawResults = await searchCatalogSmart({
        organization_id,
        query: text,
      });

      safeCatalog = (rawResults || []).slice(0, 3);
    } catch (err) {
      console.warn("Catalog error:", err);
    }

    // ================================
// GREETING CONTROL (BLOCK 1.4)
// ================================
if (refinedIntent === "GREETING") {
  return {
    reply: {
      text: `Hola 😊 soy ${orgContext.assistant_name} de ${orgContext.business_name}, con gusto te ayudo. ¿En qué te puedo colaborar?`,
      media: [],
    },
    meta: { intent: "GREETING" },
  };
}
    
    // ================================
    // AI
    // ================================
    let aiText = null;

    try {
      const prompt = buildPrompt({
        context: {
          intent: refinedIntent,
          organization: orgContext,
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

    // ================================
    // FALLBACK
    // ================================
    let replyText = aiText;

    if (!replyText) {
      replyText = "Hola 😊 con mucho gusto le ayudo. ¿En qué le puedo colaborar?";
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
      meta: { intent: refinedIntent },
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

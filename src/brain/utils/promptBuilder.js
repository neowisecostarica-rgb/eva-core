/*
====================================================
EVA CORE — SALES BRAIN (SOT MASTER CLEAN)
====================================================
*/

import {
  getOrganizationSettings,
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

    // ================================
    // SOT — ORGANIZATION (🔥 CORE)
    // ================================
    const orgSettings = await getOrganizationSettings(organization_id);

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

    if (t.includes("no sirve") || t.includes("error")) {
      refinedIntent = "SERVICE";
    }

    // ================================
    // FLOW CONTROL (🔥 SYSTEM FIRST)
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

    if (refinedIntent === "SERVICE") {
      return {
        reply: {
          text: `Claro 😊 con gusto te ayudo. ¿Me podés contar qué problema presenta tu equipo?`,
          media: [],
        },
        meta: { intent: "SERVICE" },
      };
    }

    // ================================
    // CATALOG
    // ================================
    let safeCatalog = [];

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
    // AI
    // ================================
    let aiText = null;

    try {
      const prompt = buildPrompt({
        context: {
          intent: refinedIntent,
          organization: orgContext,
        },
        history,
        catalogResults: safeCatalog,
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
      replyText = `Con gusto 😊 ¿Me podés contar un poco más de lo que estás buscando?`;
    }

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

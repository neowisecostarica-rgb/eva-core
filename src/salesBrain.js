/*
====================================================
EVA CORE — SALES BRAIN (FIXED CLEAN FINAL)
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
  const { context = {} } = payload;

  try {
    const { organization_id, phone, text, channel, message_id } = payload;

    let safeCatalog = [];

    // ================================
    // PROMPT CONFIG
    // ================================
    let promptConfig = null;

    try {
      promptConfig = await getPromptConfig(organization_id);
    } catch {}

    // ================================
    // ORG SETTINGS
    // ================================
    let orgSettings = null;

    try {
      orgSettings = await getOrganizationSettings(organization_id);
    } catch {}

    const orgContext = {
      business_name:
        context?.organization?.business_name ||
        orgSettings?.business_name ||
        "el negocio",

      assistant_name:
        context?.assistant?.name ||
        orgSettings?.assistant_name ||
        "asistente",

      tone:
        context?.assistant?.tone ||
        orgSettings?.tone ||
        "profesional",
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

    // ========================================
// CANCEL PENDING FOLLOWUPS (🔥 FIX REAL)
// ========================================
try {
  await db.query(
    `
    UPDATE followups
    SET status = 'CANCELLED'
    WHERE conversation_id = $1
      AND status IN ('pending', 'scheduled')
    `,
    [conversation.id]
  );
} catch (err) {
  console.error("FOLLOWUP_CANCEL_ERROR", err);
}
    
    const historyRes = await db.query(
      `SELECT role, content AS text FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 10`,
      [conversation.id]
    );

    const history = historyRes.rows || [];

    // ================================
    // INTENT
    // ================================
    const rawIntent = detectIntent(text);
    let refinedIntent = normalizeIntent(rawIntent);

    const t = String(text || "").toLowerCase();

    if (refinedIntent === "INFO" && t.includes("precio")) {
      refinedIntent = "BUY";
    }

    if (refinedIntent === "GREETING" && t.includes("busco")) {
      refinedIntent = "BUY";
    }

    if (t.includes("no sirve") || t.includes("error")) {
      refinedIntent = "SERVICE";
    }

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
    // GREETING DIRECT RESPONSE
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
      replyText =
        "Hola 😊 con mucho gusto le ayudo. ¿En qué le puedo colaborar?";
    }

    // ================================
    // GENERATE REPLY (FIX 🔥)
    // ================================
    const reply = generateReply({
      text: replyText,
      intent: refinedIntent,
      products:
        refinedIntent === "BUY" || refinedIntent === "CLOSE_INTENT"
          ? safeCatalog
          : [],
    });

    // ================================
    // SAVE MESSAGE (FIX 🔥)
    // ================================
    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      text: reply.text,
    });

// ================================
// FOLLOWUP
// ================================
try {
  const isHotLead =
    refinedIntent === "CLOSE_INTENT" ||
    t.includes("quiero comprar") ||
    t.includes("lo quiero") ||
    t.includes("cómo pago");

  if (!isHotLead) {
    const followupDate = new Date();
    followupDate.setHours(followupDate.getHours() + 24);

    // ========================================
    // PREVENT DUPLICATE FOLLOWUPS
    // ========================================
    const existingFollowup = await db.query(
      `
      SELECT id FROM followups
      WHERE conversation_id = $1
        AND status IN ('pending', 'scheduled')
      LIMIT 1
      `,
      [conversation.id]
    );

    if (existingFollowup.rows.length === 0) {
      await db.query(
        `
        INSERT INTO followups (
          organization_id,
          conversation_id,
          lead_phone,
          reason,
          scheduled_for,
          status,
          sent,
          retry_count,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 'PENDING', false, 0, NOW(), NOW())
        `,
        [
          organization_id,
          conversation.id,
          phone,
          "sales_followup",
          followupDate,
        ]
      );
    } else {
      console.log("FOLLOWUP_SKIPPED_DUPLICATE", {
        conversation_id: conversation.id,
      });
    }
  } // ✅ cierre del if

} catch (err) {
  console.warn("Followup error:", err);
}

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

/*
====================================================
EVA CORE — SALES BRAIN (CLEAN P5)
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

function decideStrategy({ intent }) {
  if (intent === "BUY") return "QUALIFY";
  if (intent === "CLOSE_INTENT") return "CLOSE";
  if (intent === "SERVICE") return "DIAGNOSE";
  if (intent === "INFO") return "EDUCATE";
  if (intent === "FOLLOWUP") return "FOLLOWUP";
  return "DEFAULT";
}

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

function isHotLeadIntent(intent, text = "") {
  return (
    intent === "CLOSE_INTENT" ||
    text.includes("quiero comprar") ||
    text.includes("lo quiero") ||
    text.includes("como pago") ||
    text.includes("cómo pago")
  );
}

function extractBudget(text = "") {
  try {
    const match = text.replace(/[,\.]/g, "").match(/\b\d{5,}\b/);
    return match ? parseInt(match[0], 10) : null;
  } catch {
    return null;
  }
}

function extractUseCase(text = "") {
  try {
    const lower = text.toLowerCase();
    if (lower.includes("para ")) return lower.split("para ")[1]?.slice(0, 40);
    if (lower.includes("uso ")) return lower.split("uso ")[1]?.slice(0, 40);
    return null;
  } catch {
    return null;
  }
}

function extractProductInterest(text = "") {
  try {
    return text.split(" ").slice(0, 6).join(" ");
  } catch {
    return null;
  }
}

function computeInterestLevel(intent, text = "") {
  const t = text.toLowerCase();

  if (
    intent === "CLOSE_INTENT" ||
    t.includes("lo quiero") ||
    t.includes("como pago") ||
    t.includes("cómo pago")
  ) {
    return "HIGH";
  }

  if (intent === "BUY" || intent === "FOLLOWUP") return "MEDIUM";

  return "LOW";
}

/*
====================================================
FOLLOWUPS
====================================================
*/

async function cancelPendingFollowups(conversationId) {
  try {
    await db.query(
      `UPDATE followups
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE conversation_id = $1
       AND UPPER(status) IN ('PENDING','SCHEDULED')`,
      [conversationId]
    );
  } catch (err) {
    console.error("FOLLOWUP_CANCEL_ERROR", err);
  }
}

async function createFollowupIfNeeded({
  organization_id,
  conversation_id,
  phone,
  reason = "sales_followup",
  hoursFromNow = 24,
}) {
  try {
    const existing = await db.query(
      `SELECT id FROM followups
       WHERE conversation_id = $1
       AND status IN ('PENDING','SCHEDULED')
       AND scheduled_for > NOW()
       LIMIT 1`,
      [conversation_id]
    );

    if (existing.rows.length > 0) return;

    await db.query(
      `INSERT INTO followups (
        organization_id, conversation_id, lead_phone,
        status, reason, scheduled_for, due_at, created_at
      )
      VALUES (
        $1,$2,$3,'PENDING',$4,
        NOW() + ($5 * interval '1 hour'),
        NOW() + ($5 * interval '1 hour'),
        NOW()
      )`,
      [organization_id, conversation_id, phone, reason, Number(hoursFromNow)]
    );

    console.log("📌 Followup creado:", conversation_id);
  } catch (err) {
    console.error("❌ Error creando followup:", err);
  }
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
    } catch (e) {
      console.warn("PROMPT_CONFIG_ERROR", e);
    }

    try {
      orgSettings = await getOrganizationSettings(organization_id);
    } catch (e) {
      console.warn("ORG_SETTINGS_ERROR", e);
    }

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

    await savePipelineEvent({
      organization_id,
      lead_id: lead?.id,
      conversation_id: conversation.id,
      event_type: "INBOUND_RECEIVED",
      metadata: { text, channel },
    });

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "user",
      text,
      message_id,
    });

    await cancelPendingFollowups(conversation.id);

    const historyRes = await db.query(
      `SELECT role, content AS text
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT 10`,
      [conversation.id]
    );

    const history = historyRes.rows || [];

  // ================================
// INTENT
// ================================
let refinedIntent = normalizeIntent(detectIntent(text));
const t = String(text || "").toLowerCase();

if (refinedIntent === "INFO" && t.includes("precio")) refinedIntent = "BUY";
if (refinedIntent === "GREETING" && t.includes("busco"))
  refinedIntent = "BUY";
if (t.includes("no sirve") || t.includes("error"))
  refinedIntent = "SERVICE";

// ✅ AHORA sí calculamos strategy
const strategy = decideStrategy({ intent: refinedIntent });

await savePipelineEvent({
  organization_id,
  lead_id: lead?.id,
  conversation_id: conversation.id,
  event_type: "INTENT_DETECTED",
  metadata: { intent: refinedIntent, text },
});

    // ================================
    // CATALOG
    // ================================
    try {
      const results = await searchCatalogSmart({
        organization_id,
        query: text,
      });

      safeCatalog = (results || []).slice(0, 3);
    } catch (err) {
      console.warn("Catalog error:", err);
    }

    // ================================
    // AI
    // ================================
    let aiText = null;

    const prompt = buildPrompt({
  context: {
    intent: refinedIntent,
    strategy, // 🔥 NUEVO
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

    // ================================
    // FALLBACK + GUARDS
    // ================================
    const fallbackGreeting =
      promptConfig?.greeting ||
      `Hola 😊 le atiende ${
        orgContext?.assistant_name || "nuestro equipo"
      }, ¿en qué le puedo ayudar?`;

    if (refinedIntent === "GREETING") {
      const lower = (aiText || "").toLowerCase();
      const isSelling =
        lower.includes("₡") ||
        lower.includes("precio") ||
        lower.includes("recomiendo") ||
        lower.includes("tenemos");

      if (isSelling) aiText = fallbackGreeting;
    }

    let replyText =
      !aiText || aiText.length < 5 || aiText.includes("no sé")
        ? fallbackGreeting
        : aiText;


// ================================
// GUARDRAIL: LIMPIEZA DE TEXTO (NO VENTA)
// ================================
if (refinedIntent === "GREETING" || refinedIntent === "SUPPORT") {
  replyText = replyText
    .replace(/₡\s?\d+/g, "")
    .replace(/\*\*.*?\*\*/g, "")
    .replace(/laptop[s]?|computadora[s]?|equipo[s]?/gi, "");
}
    
    
    // ================================
// GUARDRAIL: NO VENTA SEGÚN INTENT
// ================================
if (refinedIntent === "GREETING" || refinedIntent === "SUPPORT") {
  safeCatalog = [];
}
    
    // ================================
    // FINAL REPLY
    // ================================
    const reply = generateReply({
      text: replyText,
      intent: refinedIntent,
      products:
        refinedIntent === "BUY" || refinedIntent === "CLOSE_INTENT"
          ? safeCatalog
          : [],
    });

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      text: reply.text,
    });

    await savePipelineEvent({
      organization_id,
      lead_id: lead?.id,
      conversation_id: conversation.id,
      event_type: "AI_RESPONSE_SENT",
      metadata: { intent: refinedIntent, response: reply.text },
    });

    // ================================
    // STAGE + SCORE
    // ================================
    let newStage = "new";
    let newScore = 5;

    if (refinedIntent === "INFO") newScore = 15;
    if (refinedIntent === "BUY") {
      newStage = "qualified";
      newScore = 45;
    }
    if (refinedIntent === "SERVICE") {
      newStage = "qualified";
      newScore = 35;
    }
    if (refinedIntent === "FOLLOWUP") {
      newStage = "qualified";
      newScore = 40;
    }
    if (refinedIntent === "CLOSE_INTENT" || isHotLeadIntent(refinedIntent, t)) {
      newStage = "hot";
      newScore = 90;
    }

    await updateLeadStageAndScore({
      organization_id,
      lead_id: lead?.id,
      new_stage: newStage,
      new_score: newScore,
    });

    // ================================
    // MEMORY
    // ================================
    const memory = {
      budget: extractBudget(text),
      use_case: extractUseCase(text),
      product_interest: extractProductInterest(text),
      interest_level: computeInterestLevel(refinedIntent, text),
      last_intent: refinedIntent,
    };

    if (Object.values(memory).some(Boolean)) {
      await updateLeadMemory({
        organization_id,
        lead_id: lead?.id,
        memory,
      });

      await savePipelineEvent({
        organization_id,
        lead_id: lead?.id,
        conversation_id: conversation.id,
        event_type: "LEAD_MEMORY_UPDATED",
        metadata: memory,
      });
    }

    if (!isHotLeadIntent(refinedIntent, t)) {
      await createFollowupIfNeeded({
        organization_id,
        conversation_id: conversation.id,
        phone,
      });
    }

    // ================================
    // LOG
    // ================================
    console.log(
      JSON.stringify({
        tag: "EVA_LOG",
        timestamp: new Date().toISOString(),
        organization_id,
        conversation_id: conversation.id,
        lead_id: lead?.id,
        phone,
        intent: refinedIntent,
        input_text: text,
        output_text: reply.text,
        has_catalog:
          safeCatalog.length > 0 && refinedIntent !== "GREETING",
      })
    );

    return {
      reply,
      meta: {
        intent: refinedIntent,
        lead_id: lead?.id || null,
        conversation_id: conversation.id,
      },
    };
  } catch (err) {
    console.error("❌ SALES BRAIN ERROR:", err);

    return {
      reply: {
        text: "Hubo un problema procesando tu solicitud. Intenta nuevamente.",
      },
      meta: {
        intent: "ERROR",
        lead_id: null,
        conversation_id: null,
      },
    };
  }
}

/*
====================================================
EVA CORE — SALES BRAIN (FIXED CLEAN FINAL + EVENTS)
====================================================
*/

import db, {
  getOrganizationSettings,
  findOrCreateLead,
  findOrCreateConversation,
  saveMessage,
  savePipelineEvent, // 🔥 NUEVO
} from "./db.js";

import { searchCatalogSmart } from "./brain/utils/catalogEngine.js";
import { generateReply } from "./brain/replies/replyEngine.js";
import { updateLeadStageAndScore } from "./db.js";
import { enforceAIRuntime } from "./system/contracts/aiRuntime.js";
import { runAI } from "./brain/engines/aiEngine.js";
import { applyAIGuards } from "./brain/utils/aiGuards.js";
import { buildPrompt } from "./brain/utils/promptBuilder.js";
import { getPromptConfig } from "./brain/utils/getPromptConfig.js";
import { updateLeadMemory } from "./db.js";
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

function isHotLeadIntent(refinedIntent, normalizedText) {
  return (
    refinedIntent === "CLOSE_INTENT" ||
    normalizedText.includes("quiero comprar") ||
    normalizedText.includes("lo quiero") ||
    normalizedText.includes("como pago") ||
    normalizedText.includes("cómo pago")
  );
}

function extractBudget(text = "") {
  try {
    const match = text.replace(/[,\.]/g, "").match(/\b\d{5,}\b/);
    if (match) return parseInt(match[0], 10);
    return null;
  } catch {
    return null;
  }
}

function extractUseCase(text = "") {
  try {
    const lower = text.toLowerCase();

    if (lower.includes("para ")) {
      const parts = lower.split("para ");
      return parts[1]?.slice(0, 40) || null;
    }

    if (lower.includes("uso ")) {
      const parts = lower.split("uso ");
      return parts[1]?.slice(0, 40) || null;
    }

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
    t.includes("cómo pago") ||
    t.includes("como pago")
  ) {
    return "HIGH";
  }

  if (intent === "BUY" || intent === "FOLLOWUP") {
    return "MEDIUM";
  }

  return "LOW";
}

async function cancelPendingFollowups(conversationId) {
  try {
    await db.query(
      `
      UPDATE followups
      SET status = 'CANCELLED',
          updated_at = NOW()
      WHERE conversation_id = $1
        AND UPPER(status) IN ('PENDING', 'SCHEDULED')
      `,
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
      `
      SELECT id
      FROM followups
      WHERE conversation_id = $1
        AND status IN ('PENDING', 'SCHEDULED')
        AND scheduled_for > NOW()
      LIMIT 1
      `,
      [conversation_id]
    );

    if (existing.rows.length > 0) {
      return;
    }

    await db.query(
      `
      INSERT INTO followups (
        organization_id,
        conversation_id,
        lead_phone,
        status,
        reason,
        scheduled_for,
        created_at
      )
      VALUES ($1, $2, $3, 'PENDING', $4, NOW() + ($5 || ' hours')::interval, NOW())
      `,
      [organization_id, conversation_id, phone, reason, hoursFromNow]
    );

    console.log("📌 Followup creado:", conversation_id);

  } catch (err) {
    console.error("❌ Error creando followup:", err);
  }
}

    const followupDate = new Date();
    followupDate.setHours(followupDate.getHours() + hoursFromNow);

    console.log("FOLLOWUP_CREATING", {
      conversation_id,
      phone,
    });

    await db.query(
      `
      INSERT INTO followups (
        organization_id,
        conversation_id,
        lead_phone,
        reason,
        scheduled_for,
        due_at,
        status,
        sent,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $5, 'PENDING', false, NOW(), NOW())
      `,
      [organization_id, conversation_id, phone, reason, followupDate]
    );

    console.log("FOLLOWUP_CREATED", {
      conversation_id,
    });
  } catch (err) {
    console.warn("Followup error:", err);
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
    try {
      promptConfig = await getPromptConfig(organization_id);
    } catch (err) {
      console.warn("PROMPT_CONFIG_ERROR", err);
    }

    let orgSettings = null;
    try {
      orgSettings = await getOrganizationSettings(organization_id);
    } catch (err) {
      console.warn("ORG_SETTINGS_ERROR", err);
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

    // 🔥 EVENT 1
    await savePipelineEvent({
      organization_id,
      lead_id: lead?.id,
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

    // 🔥 EVENT 2
    await savePipelineEvent({
      organization_id,
      lead_id: lead?.id,
      event_type: "INTENT_DETECTED",
      metadata: { intent: refinedIntent, text },
    });

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
    // GREETING
    // ================================
    if (refinedIntent === "GREETING") {
      const greetingReply = {
        text: `Hola 😊 soy ${orgContext.assistant_name} de ${orgContext.business_name}, con gusto te ayudo. ¿En qué te puedo colaborar?`,
        media: [],
      };

      await saveMessage({
        organization_id,
        conversation_id: conversation.id,
        role: "assistant",
        text: greetingReply.text,
      });

      await createFollowupIfNeeded({
        organization_id,
        conversation_id: conversation.id,
        phone,
      });

      return { reply: greetingReply, meta: { intent: "GREETING" } };
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

      if (guarded?.text) {
        aiText = guarded.text;
      }
    } catch (err) {
      console.warn("AI error:", err);
    }

    let replyText =
      aiText ||
      "Hola 😊 con mucho gusto le ayudo. ¿En qué le puedo colaborar?";

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

    // 🔥 EVENT 3
    await savePipelineEvent({
      organization_id,
      lead_id: lead?.id,
      event_type: "AI_RESPONSE_SENT",
      metadata: {
        intent: refinedIntent,
        response: reply.text,
      },
    });
// ================================
// STAGE + SCORE ENGINE 🔥
// ================================

let newStage = "new";
let newScore = 5;

if (refinedIntent === "INFO") {
  newScore = 15;
}

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

// 🔥 UPDATE LEAD
await updateLeadStageAndScore({
  organization_id,
  lead_id: lead?.id,
  new_stage: newStage,
  new_score: newScore,
});

// 🔥 EVENT
await savePipelineEvent({
  organization_id,
  lead_id: lead?.id,
  event_type: "LEAD_STAGE_UPDATED",
  metadata: {
    stage: newStage,
    score: newScore,
    intent: refinedIntent,
  },
});
    
 const isHotLead = isHotLeadIntent(refinedIntent, t);

// ================================
// SALES MEMORY ENGINE 🔥
// ================================

const memory = {
  budget: extractBudget(text),
  use_case: extractUseCase(text),
  product_interest: extractProductInterest(text),
  interest_level: computeInterestLevel(refinedIntent, text),
  last_intent: refinedIntent,
};

// 🔥 SOLO guardar si hay algo útil
const hasMemory =
  memory.budget ||
  memory.use_case ||
  memory.product_interest ||
  memory.interest_level;

if (hasMemory) {
  await updateLeadMemory({
    organization_id,
    lead_id: lead?.id,
    memory,
  });

  await savePipelineEvent({
    organization_id,
    lead_id: lead?.id,
    event_type: "LEAD_MEMORY_UPDATED",
    metadata: memory,
  });
}

if (!isHotLead) {
  await createFollowupIfNeeded({
    organization_id,
    conversation_id: conversation.id,
    phone,
  });
}

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

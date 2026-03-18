/*
====================================================
EVA SALES BRAIN
Commercial Decision Engine (ORCHESTRATOR)
====================================================
*/

import pool from "./db.js";

/*
====================================================
BRAIN ENGINES
====================================================
*/

import { detectIntent } from "./brain/engines/intentEngine.js";
import { detectPipelineEvent } from "./brain/engines/pipelineEngine.js";
import { detectUseCase } from "./brain/engines/useCaseEngine.js";
import { detectProductInterest } from "./brain/engines/productEngine.js";
import { detectBudget } from "./brain/engines/budgetEngine.js";
import { detectInterestLevel } from "./brain/engines/interestEngine.js";
import { detectObjection } from "./brain/engines/objectionEngine.js";
import { detectClosingIntent } from "./brain/engines/closingEngine.js";
import { mergeCustomerMemory } from "./brain/engines/memoryEngine.js";
import { detectOpportunities } from "./brain/engines/opportunityEngine.js";
import { calculateCommercialState } from "./brain/engines/scoreEngine.js";

/*
====================================================
COMMERCE ENGINE
====================================================
*/

import { searchCatalog } from "./brain/commerce/catalogEngine.js";

/*
====================================================
REPLY ENGINE
====================================================
*/

import { generateReply } from "./brain/replies/replyEngine.js";

/*
====================================================
UTILS
====================================================
*/

import { normalizePhone } from "./brain/utils/textUtils.js";
import { safeJson } from "./brain/utils/jsonUtils.js";
import { nowIso } from "./brain/utils/timeUtils.js";

/*
====================================================
HELPERS
====================================================
*/

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function detectManualQualification(text = "") {
  const normalized = normalizeText(text);

  if (
    normalized.includes("trabajo") ||
    normalized.includes("oficina") ||
    normalized.includes("empresa") ||
    normalized.includes("negocio")
  ) {
    return "work";
  }

  if (
    normalized.includes("estudio") ||
    normalized.includes("colegio") ||
    normalized.includes("universidad") ||
    normalized.includes("escuela")
  ) {
    return "study";
  }

  return null;
}

function buildStageAwareReply({
  stage,
  qualification,
  products = []
}) {
  const first = products?.[0] || null;
  const second = products?.[1] || null;

  if (stage === "catalog_shown" && qualification === "work") {
    if (second) {
      return {
        text: `Perfecto 🙌 para trabajo te recomiendo una opción más fluida:

💻 ${second.name}
💰 ₡${Number(second.price_crc || 0).toLocaleString()}

Es una muy buena opción para oficina, multitarea y uso más constante.

¿Te gustaría que te envíe fotos reales o prefieres que te comparta los datos para apartarla?`,
        media: []
      };
    }

    if (first) {
      return {
        text: `Perfecto 🙌 para trabajo esta opción te puede funcionar muy bien:

💻 ${first.name}
💰 ₡${Number(first.price_crc || 0).toLocaleString()}

Es una alternativa práctica para uso diario y trabajo.

¿Te gustaría ver fotos reales o te paso los datos para apartarla?`,
        media: []
      };
    }
  }

  if (stage === "catalog_shown" && qualification === "study") {
    if (first) {
      return {
        text: `Buenísimo 🙌 para estudio esta es una excelente opción:

💻 ${first.name}
💰 ₡${Number(first.price_crc || 0).toLocaleString()}

Es una laptop práctica, confiable y muy buena para clases, tareas y uso diario.

¿Te gustaría que te envíe fotos reales o prefieres apartarla?`,
        media: []
      };
    }
  }

  return null;
}

function safeReplyText(replyResult, products = []) {
  const text = String(replyResult?.text || "").trim();

  if (text) return text;

  if (products.length > 0) {
    const product = products[0];

    return `Claro 🙌 tenemos opciones disponibles.

💻 ${product.name}
💰 ₡${Number(product.price_crc || 0).toLocaleString()}

¿La necesitas para estudio o trabajo?`;
  }

  return "Hola 👋 Soy EVA, asistente de ventas. Cuéntame qué producto estás buscando y con gusto te ayudo.";
}

/*
====================================================
DATABASE HELPERS
====================================================
*/

async function hasProcessedMessage({ organization_id, external_message_id }) {
  if (!external_message_id) return false;

  const result = await pool.query(
    `
    SELECT id
    FROM messages
    WHERE organization_id = $1
      AND external_message_id = $2
    LIMIT 1
    `,
    [organization_id, external_message_id]
  );

  return result.rows.length > 0;
}

async function ensureConversation({ organization_id, phone, channel = "whatsapp" }) {
  const result = await pool.query(
    `
    SELECT *
    FROM conversations
    WHERE organization_id = $1
      AND external_user_id = $2
      AND channel = $3
    LIMIT 1
    `,
    [organization_id, phone, channel]
  );

  if (result.rows.length > 0) {
    return result.rows[0];
  }

  const timestamp = nowIso();

  const created = await pool.query(
    `
    INSERT INTO conversations
    (
      organization_id,
      external_user_id,
      channel,
      stage,
      created_at,
      updated_at,
      last_message_at
    )
    VALUES ($1,$2,$3,'new',$4,$4,$4)
    RETURNING *
    `,
    [organization_id, phone, channel, timestamp]
  );

  return created.rows[0];
}

async function touchConversation({ conversation_id }) {
  const timestamp = nowIso();

  await pool.query(
    `
    UPDATE conversations
    SET updated_at = $2,
        last_message_at = $2
    WHERE id = $1
    `,
    [conversation_id, timestamp]
  );
}

async function updateConversationStage({ conversation_id, stage }) {
  await pool.query(
    `
    UPDATE conversations
    SET stage = $2,
        updated_at = $3
    WHERE id = $1
    `,
    [conversation_id, stage, nowIso()]
  );
}

/*
====================================================
SAVE MESSAGE
====================================================
*/

async function saveMessage({
  organization_id,
  conversation_id,
  role,
  content,
  external_message_id = null
}) {
  const result = await pool.query(
    `
    INSERT INTO messages
    (
      organization_id,
      conversation_id,
      role,
      content,
      external_message_id,
      created_at
    )
    VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING *
    `,
    [
      organization_id,
      conversation_id,
      role,
      content,
      external_message_id,
      nowIso()
    ]
  );

  await touchConversation({ conversation_id });

  return result.rows[0];
}

/*
====================================================
LEAD UPSERT
====================================================
*/

async function upsertLead({
  organization_id,
  phone,
  intent,
  product_interest,
  use_case,
  budget,
  score,
  stage
}) {
  await pool.query(
    `
    INSERT INTO leads
    (
      organization_id,
      phone,
      intent,
      product_interest,
      use_case,
      budget,
      score,
      stage,
      created_at,
      updated_at,
      last_contact_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$9)
    ON CONFLICT (organization_id, phone)
    DO UPDATE SET
      intent = EXCLUDED.intent,
      product_interest = COALESCE(EXCLUDED.product_interest, leads.product_interest),
      use_case = COALESCE(EXCLUDED.use_case, leads.use_case),
      budget = COALESCE(EXCLUDED.budget, leads.budget),
      score = EXCLUDED.score,
      stage = EXCLUDED.stage,
      updated_at = $9,
      last_contact_at = $9
    `,
    [
      organization_id,
      phone,
      intent,
      product_interest,
      use_case,
      budget,
      score,
      stage,
      nowIso()
    ]
  );
}

/*
====================================================
PIPELINE EVENT LOGGER
====================================================
*/

async function savePipelineEvent({
  organization_id,
  conversation_id,
  lead_phone,
  from_stage,
  to_stage,
  event_type
}) {
  await pool.query(
    `
    INSERT INTO pipeline_events
    (
      organization_id,
      conversation_id,
      lead_phone,
      from_stage,
      to_stage,
      event_type,
      created_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    `,
    [
      organization_id,
      conversation_id,
      lead_phone,
      from_stage,
      to_stage,
      event_type,
      nowIso()
    ]
  );
}

/*
====================================================
MAIN ORCHESTRATOR
====================================================
*/

export async function handleInbound({ organization_id, payload }) {
  try {
    const phone = normalizePhone(payload?.phone || payload?.from || "");
    const text = String(payload?.message || payload?.text || "").trim();
    const channel = String(payload?.channel || "whatsapp").toLowerCase();
    const externalMessageId =
      payload?.message_id || payload?.external_message_id || null;

    if (!organization_id) return { error: "missing_organization_id" };
    if (!phone || !text) return { error: "invalid_payload" };

    const alreadyProcessed = await hasProcessedMessage({
      organization_id,
      external_message_id: externalMessageId
    });

    if (alreadyProcessed) {
      return { ok: true, duplicate: true };
    }

    const conversation = await ensureConversation({
      organization_id,
      phone,
      channel
    });

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "user",
      content: text,
      external_message_id: externalMessageId
    });

    /*
    ================================================
    DETECTION ENGINES
    ================================================
    */

    const intent = detectIntent(text);
    const pipelineEvent = detectPipelineEvent(text);
    const useCase = detectUseCase(text) || null;
    const productInterest = detectProductInterest(text) || null;
    const budget = detectBudget(text) || null;

    const interestLevel = detectInterestLevel({
      intent,
      pipelineEvent,
      text
    });

    const objection = detectObjection(text);
    const closingIntent = detectClosingIntent(text);
    const opportunities = detectOpportunities(text);

    const commercialState = calculateCommercialState({
      intent,
      product_interest: productInterest,
      use_case: useCase,
      budget,
      interest_level: interestLevel,
      objection,
      closing_intent: closingIntent,
      pipeline_event: pipelineEvent,
      text
    });

    let leadScore = commercialState?.score ?? 0;
    let leadStage = commercialState?.stage ?? conversation?.stage ?? "new";

    /*
    ================================================
    SEARCH PRODUCTS
    ================================================
    */

    const products = await searchCatalog({
      organization_id,
      text
    });

    console.log("INPUT TEXT:", text);
    console.log("CATALOG RESULT:", products);
    console.log("CURRENT CONVERSATION STAGE:", conversation?.stage);

    /*
    ================================================
    STAGE OVERRIDE / CONVERSATIONAL MEMORY
    ================================================
    */

    const qualification = detectManualQualification(text);
    let replyResult = null;

    if (conversation?.stage === "catalog_shown" && qualification) {
      leadStage = qualification === "work" ? "qualified_work" : "qualified_study";

      replyResult = buildStageAwareReply({
        stage: "catalog_shown",
        qualification,
        products
      });
    } else if (
      products.length > 0 &&
      (intent === "BUY" || intent === "UNKNOWN" || intent === "SUPPORT" || intent === "GREETING")
    ) {
      leadStage = "catalog_shown";
    }

    /*
    ================================================
    LEAD UPSERT
    ================================================
    */

    await upsertLead({
      organization_id,
      phone,
      intent,
      product_interest: productInterest,
      use_case: useCase,
      budget,
      score: leadScore,
      stage: leadStage
    });

    await updateConversationStage({
      conversation_id: conversation.id,
      stage: leadStage
    });

    if (pipelineEvent) {
      await savePipelineEvent({
        organization_id,
        conversation_id: conversation.id,
        lead_phone: phone,
        from_stage: conversation.stage || "new",
        to_stage: leadStage,
        event_type: pipelineEvent
      });
    }

    /*
    ================================================
    GENERATE REPLY
    ================================================
    */

    if (!replyResult) {
      replyResult = await generateReply({
        intent,
        interestLevel,
        objection,
        closingIntent,
        opportunities,
        score: leadScore,
        stage: leadStage,
        catalogMatches: products
      });
    }

    const replyText = safeReplyText(replyResult, products);

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      content: replyText
    });

    return {
      ok: true,
      reply: replyText,
      media: replyResult?.media || [],
      intent,
      product_interest: productInterest,
      score: leadScore,
      stage: leadStage
    };

  } catch (err) {
    console.error("EVA SALES BRAIN ERROR", {
      message: err.message,
      stack: err.stack
    });

    return {
      error: "brain_error",
      details: err.message || "unknown brain error"
    };
  }
}

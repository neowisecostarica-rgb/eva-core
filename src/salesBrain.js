/*
====================================================
EVA SALES BRAIN
Commercial Decision Engine (ORCHESTRATOR)
====================================================

Responsabilidades principales:

• Procesar mensajes entrantes
• Detectar intención comercial
• Actualizar CRM
• Buscar catálogo
• Generar respuesta comercial
• Registrar eventos de pipeline
• Crear followups automáticos
• Evitar duplicados inbound
• Registrar execution logs

Arquitectura:

brain/
 ├ utils/
 ├ engines/
 ├ commerce/
 └ replies/

Este archivo SOLO coordina motores.
NO contiene lógica pesada.
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
LOCAL HELPERS
====================================================
*/

function normalizeSearchText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function buildKeywordPatterns({ product_interest, use_case, text }) {
  const raw = [product_interest, use_case, text].filter(Boolean).join(" ");
  const normalized = normalizeSearchText(raw);

  if (!normalized) return [];

  const stopwords = new Set([
    "hola",
    "buenas",
    "buenos",
    "buenas tardes",
    "buenos dias",
    "gracias",
    "quiero",
    "ocupo",
    "necesito",
    "para",
    "con",
    "una",
    "uno",
    "unas",
    "unos",
    "del",
    "las",
    "los",
    "por",
    "que",
    "me",
    "de",
    "la",
    "el",
    "un",
    "es",
    "en",
    "y",
    "o",
    "a"
  ]);

  const tokens = [
    ...new Set(
      normalized
        .split(/[^a-z0-9]+/i)
        .map((value) => value.trim())
        .filter((value) => value.length >= 2 && !stopwords.has(value))
    )
  ];

  return tokens.slice(0, 8).map((token) => `%${token}%`);
}

function safeReplyText(replyResult) {
  const text = String(replyResult?.text || "").trim();

  if (text) {
    return text;
  }

  return "Hola 👋 Con gusto te ayudo. Cuéntame un poco más sobre lo que necesitas y te asesoro.";
}

/*
====================================================
DATABASE HELPERS
====================================================
*/

async function hasProcessedMessage({ organization_id, external_message_id }) {
  if (!external_message_id) {
    return false;
  }

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
      created_at,
      updated_at,
      last_message_at
    )
    VALUES ($1, $2, $3, $4, $4, $4)
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
    VALUES ($1, $2, $3, $4, $5, $6)
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

Crea o actualiza un lead en el CRM.
También guarda score y stage.
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
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $9)
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
READ CUSTOMER MEMORY
====================================================
*/

async function readCustomerMemory({ organization_id, phone }) {
  const profileResult = await pool.query(
    `
    SELECT profile_json
    FROM customer_profiles
    WHERE organization_id = $1
      AND external_user_id = $2
    LIMIT 1
    `,
    [organization_id, phone]
  );

  if (profileResult.rows.length === 0) {
    return {};
  }

  return safeJson(profileResult.rows[0].profile_json, {});
}

/*
====================================================
UPDATE CUSTOMER MEMORY
====================================================
*/

async function updateCustomerMemory({
  organization_id,
  phone,
  profile
}) {
  await pool.query(
    `
    INSERT INTO customer_profiles
    (
      organization_id,
      external_user_id,
      profile_json,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $4)
    ON CONFLICT (organization_id, external_user_id)
    DO UPDATE SET
      profile_json = $3,
      updated_at = $4
    `,
    [
      organization_id,
      phone,
      JSON.stringify(profile),
      nowIso()
    ]
  );
}

/*
====================================================
PRODUCT INTELLIGENCE SEARCH
====================================================

Busca productos de forma más humana.

Se apoya en:
• product_interest
• use_case
• budget
• text del cliente

Busca por:
• category
• name
• description

Si existe budget, intenta priorizar opciones dentro
o cerca del rango detectado.
*/

async function searchCatalogSmart({
  organization_id,
  product_interest,
  use_case,
  budget,
  text
}) {
  const patterns = buildKeywordPatterns({
    product_interest,
    use_case,
    text
  });

  if (patterns.length === 0) {
    return [];
  }

  /*
  ----------------------------------------------------
  QUERY BASE CON BUDGET
  ----------------------------------------------------
  */

  if (budget) {
    const result = await pool.query(
      `
      SELECT *
      FROM product_catalog
      WHERE organization_id = $1
        AND is_active = true
        AND (
          category ILIKE ANY($2::text[])
          OR name ILIKE ANY($2::text[])
          OR description ILIKE ANY($2::text[])
        )
        AND (
          price_crc IS NULL
          OR price_crc <= $3
          OR price_crc <= ($3 + 30000)
        )
      ORDER BY
        CASE
          WHEN price_crc IS NOT NULL AND price_crc <= $3 THEN 0
          WHEN price_crc IS NOT NULL AND price_crc <= ($3 + 30000) THEN 1
          ELSE 2
        END,
        price_crc ASC NULLS LAST,
        featured DESC NULLS LAST,
        updated_at DESC NULLS LAST
      LIMIT 5
      `,
      [organization_id, patterns, budget]
    );

    if (result.rows.length > 0) {
      return result.rows;
    }
  }

  /*
  ----------------------------------------------------
  FALLBACK SEARCH
  ----------------------------------------------------
  */

  const fallback = await pool.query(
    `
    SELECT *
    FROM product_catalog
    WHERE organization_id = $1
      AND is_active = true
      AND (
        category ILIKE ANY($2::text[])
        OR name ILIKE ANY($2::text[])
        OR description ILIKE ANY($2::text[])
      )
    ORDER BY
      featured DESC NULLS LAST,
      updated_at DESC NULLS LAST
    LIMIT 5
    `,
    [organization_id, patterns]
  );

  return fallback.rows;
}

/*
====================================================
FOLLOWUP SCHEDULING
====================================================
*/

async function scheduleFollowupIfNeeded({
  organization_id,
  conversation_id,
  phone,
  intent,
  interestLevel,
  leadStage
}) {
  const shouldScheduleFollowup =
    intent === "BUY" ||
    interestLevel === "HIGH" ||
    leadStage === "considering" ||
    leadStage === "offer_made" ||
    leadStage === "closing";

  if (!shouldScheduleFollowup) {
    return;
  }

  try {
    const existing = await pool.query(
      `
      SELECT id
      FROM followups
      WHERE organization_id = $1
        AND conversation_id = $2
        AND lead_phone = $3
        AND reason = 'sales_followup'
        AND scheduled_for >= NOW() - INTERVAL '24 hours'
      LIMIT 1
      `,
      [organization_id, conversation_id, phone]
    );

    if (existing.rows.length > 0) {
      return;
    }

    await pool.query(
      `
      INSERT INTO followups
      (
        organization_id,
        conversation_id,
        lead_phone,
        scheduled_for,
        reason,
        status,
        created_at
      )
      VALUES
      (
        $1,
        $2,
        $3,
        NOW() + INTERVAL '24 hours',
        'sales_followup',
        'pending',
        $4
      )
      `,
      [organization_id, conversation_id, phone, nowIso()]
    );
  } catch (err) {
    console.error("FOLLOWUP SCHEDULING ERROR", err);
  }
}

/*
====================================================
EXECUTION LOG
====================================================
*/

async function saveExecutionLog({
  organization_id,
  conversation_id,
  inbound_message_id = null,
  mode_used = "RULE",
  intent = null,
  score = null,
  stage = null,
  reply = null,
  objection = null,
  closing_intent = null,
  product_interest = null,
  actions = {}
}) {
  try {
    await pool.query(
      `
      INSERT INTO eva_execution_log
      (
        organization_id,
        conversation_id,
        message_id_in,
        mode_used,
        ai_intent,
        ai_confidence,
        ai_reply,
        actions_executed,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        organization_id,
        conversation_id,
        inbound_message_id,
        mode_used,
        intent,
        score,
        reply,
        JSON.stringify({
          stage,
          objection,
          closing_intent,
          product_interest,
          ...actions
        }),
        nowIso()
      ]
    );
  } catch (err) {
    console.error("EXECUTION LOG ERROR", err);
  }
}

/*
====================================================
MAIN ORCHESTRATOR
HANDLE INBOUND MESSAGE
====================================================
*/

export async function handleInbound({ organization_id, payload }) {
  try {
    /*
    ----------------------------------------------------
    STEP 1 — VALIDATION
    ----------------------------------------------------
    */

    const phone = normalizePhone(payload?.phone || payload?.from || "");
    const text = String(payload?.message || payload?.text || "").trim();
    const channel = String(payload?.channel || "whatsapp").trim().toLowerCase();
    const externalMessageId = payload?.message_id || payload?.external_message_id || null;

    if (!organization_id) {
      return { error: "missing_organization_id" };
    }

    if (!phone || !text) {
      return { error: "invalid_payload" };
    }

    /*
    ----------------------------------------------------
    STEP 2 — IDEMPOTENCY CHECK
    ----------------------------------------------------
    */

    const alreadyProcessed = await hasProcessedMessage({
      organization_id,
      external_message_id: externalMessageId
    });

    if (alreadyProcessed) {
      return {
        ok: true,
        duplicate: true,
        reply: null,
        media: [],
        intent: null,
        product_interest: null,
        score: null,
        stage: null
      };
    }

    /*
    ----------------------------------------------------
    STEP 3 — ENSURE CONVERSATION
    ----------------------------------------------------
    */

    const conversation = await ensureConversation({
      organization_id,
      phone,
      channel
    });

    /*
    ----------------------------------------------------
    STEP 4 — READ CUSTOMER MEMORY
    ----------------------------------------------------
    */

    const existingMemory = await readCustomerMemory({
      organization_id,
      phone
    });

    /*
    ----------------------------------------------------
    STEP 5 — SAVE INBOUND MESSAGE
    ----------------------------------------------------
    */

    const inboundMessage = await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "user",
      content: text,
      external_message_id: externalMessageId
    });

    /*
    ----------------------------------------------------
    STEP 6 — SIGNAL DETECTION
    ----------------------------------------------------
    */

    const intent = detectIntent(text);
    const pipelineEvent = detectPipelineEvent(text);
    const useCase = detectUseCase(text) || existingMemory.use_case || null;
    const productInterest =
      detectProductInterest(text) ||
      existingMemory.product_interest ||
      null;
    const budget = detectBudget(text) || existingMemory.budget || null;

    const interestLevel = detectInterestLevel({
      intent,
      pipelineEvent,
      text
    });

    const objection = detectObjection(text);
    const closingIntent = detectClosingIntent(text);
    const opportunities = detectOpportunities(text);

    /*
    ----------------------------------------------------
    STEP 7 — COMMERCIAL SCORING
    ----------------------------------------------------
    */

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

    const leadScore = commercialState?.score ?? 0;
    const leadStage = commercialState?.stage ?? "new";

    /*
    ----------------------------------------------------
    STEP 8 — UPDATE LEAD
    ----------------------------------------------------
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

    /*
    ----------------------------------------------------
    STEP 9 — UPDATE CUSTOMER MEMORY
    ----------------------------------------------------
    */

    const updatedMemory = mergeCustomerMemory({
      memory: existingMemory,
      product_interest: productInterest,
      use_case: useCase,
      budget,
      pipeline_event: pipelineEvent
    });

    await updateCustomerMemory({
      organization_id,
      phone,
      profile: updatedMemory
    });

    /*
    ----------------------------------------------------
    STEP 10 — SAVE PIPELINE EVENT
    ----------------------------------------------------
    */

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
    ----------------------------------------------------
    STEP 11 — SMART CATALOG SEARCH
    ----------------------------------------------------
    */

    const catalogMatches = await searchCatalogSmart({
      organization_id,
      product_interest: productInterest,
      use_case: useCase,
      budget,
      text
    });

    /*
    ----------------------------------------------------
    STEP 12 — GENERATE REPLY
    ----------------------------------------------------
    */

    const replyResult = generateReply({
      intent,
      catalogMatches,
      interestLevel,
      objection,
      closingIntent,
      opportunities,
      score: leadScore,
      stage: leadStage
    });

    const replyText = safeReplyText(replyResult);

    /*
    ----------------------------------------------------
    STEP 13 — SCHEDULE FOLLOWUP
    ----------------------------------------------------
    */

    await scheduleFollowupIfNeeded({
      organization_id,
      conversation_id: conversation.id,
      phone,
      intent,
      interestLevel,
      leadStage
    });

    /*
    ----------------------------------------------------
    STEP 14 — SAVE BOT MESSAGE
    ----------------------------------------------------
    */

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      content: replyText
    });

    /*
    ----------------------------------------------------
    STEP 15 — EXECUTION LOG
    ----------------------------------------------------
    */

    await saveExecutionLog({
      organization_id,
      conversation_id: conversation.id,
      inbound_message_id: inboundMessage?.id || null,
      mode_used: "RULE",
      intent,
      score: leadScore,
      stage: leadStage,
      reply: replyText,
      objection,
      closing_intent: closingIntent,
      product_interest: productInterest,
      actions: {
        pipeline_event: pipelineEvent,
        interest_level: interestLevel,
        opportunities,
        catalog_match_count: catalogMatches.length,
        followup_considered: true
      }
    });

    /*
    ----------------------------------------------------
    RESPONSE
    ----------------------------------------------------
    */

    return {
      ok: true,
      reply: replyText,
      media: replyResult?.media || [],
      intent,
      product_interest: productInterest,
      score: leadScore,
      stage: leadStage,
      objection,
      closing_intent: closingIntent
    };
  } catch (err) {
    console.error("EVA SALES BRAIN ERROR", err);

    return {
      error: "brain_error",
      details: err.message || "unknown brain error"
    };
  }
}

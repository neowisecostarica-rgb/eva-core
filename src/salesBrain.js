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
DATABASE HELPERS
====================================================
*/

async function ensureConversation({ organization_id, phone }) {
  const result = await pool.query(
    `
    SELECT *
    FROM conversations
    WHERE organization_id = $1
      AND external_user_id = $2
    LIMIT 1
    `,
    [organization_id, phone]
  );

  if (result.rows.length > 0) {
    return result.rows[0];
  }

  const created = await pool.query(
    `
    INSERT INTO conversations
    (
      organization_id,
      external_user_id,
      channel,
      created_at,
      updated_at
    )
    VALUES ($1, $2, 'whatsapp', $3, $3)
    RETURNING *
    `,
    [organization_id, phone, nowIso()]
  );

  return created.rows[0];
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
  external_message_id
}) {
  await pool.query(
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
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
    ON CONFLICT (organization_id, phone)
    DO UPDATE SET
      intent = EXCLUDED.intent,
      product_interest = COALESCE(EXCLUDED.product_interest, leads.product_interest),
      use_case = COALESCE(EXCLUDED.use_case, leads.use_case),
      budget = COALESCE(EXCLUDED.budget, leads.budget),
      score = EXCLUDED.score,
      stage = EXCLUDED.stage,
      updated_at = $9
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
  event_type
}) {
  await pool.query(
    `
    INSERT INTO pipeline_events
    (
      organization_id,
      conversation_id,
      event_type,
      created_at
    )
    VALUES ($1, $2, $3, $4)
    `,
    [
      organization_id,
      conversation_id,
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
      updated_at
    )
    VALUES ($1, $2, $3, $4)
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
  const searchTerms = [
    product_interest,
    use_case,
    text
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!searchTerms) {
    return [];
  }

  /*
  ----------------------------------------------------
  QUERY BASE
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
          category ILIKE $2
          OR name ILIKE $2
          OR description ILIKE $2
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
        updated_at DESC NULLS LAST
      LIMIT 5
      `,
      [organization_id, `%${searchTerms}%`, budget]
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
        category ILIKE $2
        OR name ILIKE $2
        OR description ILIKE $2
      )
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 5
    `,
    [organization_id, `%${searchTerms}%`]
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
    leadStage === "considering";

  if (!shouldScheduleFollowup) {
    return;
  }

  try {
    await pool.query(
      `
      INSERT INTO followups
      (
        organization_id,
        conversation_id,
        lead_phone,
        scheduled_for,
        reason
      )
      VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours', 'sales_followup')
      ON CONFLICT DO NOTHING
      `,
      [organization_id, conversation_id, phone]
    );
  } catch (err) {
    console.error("FOLLOWUP SCHEDULING ERROR", err);
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

    const phone = normalizePhone(payload?.phone || "");
    const text = String(payload?.message || "").trim();

    if (!phone || !text) {
      return { error: "invalid_payload" };
    }

    /*
    ----------------------------------------------------
    STEP 2 — ENSURE CONVERSATION
    ----------------------------------------------------
    */

    const conversation = await ensureConversation({
      organization_id,
      phone
    });

    /*
    ----------------------------------------------------
    STEP 3 — READ CUSTOMER MEMORY
    ----------------------------------------------------
    */

    const existingMemory = await readCustomerMemory({
      organization_id,
      phone
    });

    /*
    ----------------------------------------------------
    STEP 4 — SAVE INBOUND MESSAGE
    ----------------------------------------------------
    */

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "user",
      content: text,
      external_message_id: payload?.message_id || null
    });

    /*
    ----------------------------------------------------
    STEP 5 — SIGNAL DETECTION
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
    STEP 6 — COMMERCIAL SCORING
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

    const leadScore = commercialState.score;
    const leadStage = commercialState.stage;

    /*
    ----------------------------------------------------
    STEP 7 — UPDATE LEAD
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
    STEP 8 — UPDATE CUSTOMER MEMORY
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
    STEP 9 — SAVE PIPELINE EVENT
    ----------------------------------------------------
    */

    if (pipelineEvent) {
      await savePipelineEvent({
        organization_id,
        conversation_id: conversation.id,
        event_type: pipelineEvent
      });
    }

    /*
    ----------------------------------------------------
    STEP 10 — SMART CATALOG SEARCH
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
    STEP 11 — GENERATE REPLY
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

    /*
    ----------------------------------------------------
    STEP 12 — SCHEDULE FOLLOWUP
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
    STEP 13 — SAVE BOT MESSAGE
    ----------------------------------------------------
    */

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      content: replyResult.text
    });

    /*
    ----------------------------------------------------
    RESPONSE
    ----------------------------------------------------
    */

    return {
      reply: replyResult.text,
      media: replyResult.media || [],
      intent,
      product_interest: productInterest,
      score: leadScore,
      stage: leadStage
    };
  } catch (err) {
    console.error("EVA SALES BRAIN ERROR", err);

    return {
      error: "brain_error",
      details: err.message || "unknown brain error"
    };
  }
}

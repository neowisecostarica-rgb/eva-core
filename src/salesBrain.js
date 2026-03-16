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
import { generateReply } from "./brain/replies/replyEngine.js";
import { detectInterestLevel } from "./brain/engines/interestEngine.js";
import { detectObjection } from "./brain/engines/objectionEngine.js";
import { detectClosingIntent } from "./brain/engines/closingEngine.js";
import { mergeCustomerMemory } from "./brain/engines/memoryEngine.js";
import { detectOpportunities } from "./brain/engines/opportunityEngine.js";
/*
====================================================
SCORE ENGINE
Calcula score comercial y stage del lead
====================================================
*/

import { calculateCommercialState } from "./brain/engines/scoreEngine.js";
/*
====================================================
BRAIN UTILITIES
====================================================
*/

import { normalizeText, normalizePhone } from "./brain/utils/textUtils.js";
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
    WHERE organization_id=$1
    AND external_user_id=$2
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
    VALUES ($1,$2,'whatsapp',$3,$3)
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
    VALUES ($1,$2,$3,$4,$5,$6)
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
/*
====================================================
LEAD UPSERT
====================================================

Crea o actualiza un lead en el CRM.

Este método ahora también guarda:

• score → nivel comercial del lead
• stage → etapa actual del pipeline

Esto permite que EVA tenga un pipeline real
similar a sistemas como HubSpot o Pipedrive.
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
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)

    ON CONFLICT (organization_id, phone)
    DO UPDATE SET
      intent=EXCLUDED.intent,
      product_interest=COALESCE(EXCLUDED.product_interest,leads.product_interest),
      use_case=COALESCE(EXCLUDED.use_case,leads.use_case),
      budget=COALESCE(EXCLUDED.budget,leads.budget),
      score=EXCLUDED.score,
      stage=EXCLUDED.stage,
      updated_at=$9
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
    VALUES ($1,$2,$3,$4)
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
CATALOG SEARCH
====================================================
*/

async function searchCatalog({
  organization_id,
  product_interest
}) {

  if (!product_interest) return [];

  const result = await pool.query(
    `
    SELECT *
    FROM product_catalog
    WHERE organization_id=$1
    AND is_active=true
    AND category ILIKE $2
    LIMIT 3
    `,
    [organization_id, `%${product_interest}%`]
  );

  return result.rows;

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
STEP 2 — CONVERSATION
----------------------------------------------------
*/

const conversation = await ensureConversation({
  organization_id,
  phone
});


/*
----------------------------------------------------
BLOQUE 9 — READ CUSTOMER MEMORY
----------------------------------------------------
*/

const profileResult = await pool.query(
  `
  SELECT profile_json
  FROM customer_profiles
  WHERE organization_id=$1
  AND external_user_id=$2
  LIMIT 1
  `,
  [organization_id, phone]
);

let existingMemory = {};

if (profileResult.rows.length > 0) {
  existingMemory = safeJson(profileResult.rows[0].profile_json, {});
}
   /*
----------------------------------------------------
STEP 3 — SAVE INBOUND MESSAGE
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
STEP 4 — SIGNAL DETECTION
----------------------------------------------------
*/

const intent = detectIntent(text);
const pipelineEvent = detectPipelineEvent(text);
const useCase = detectUseCase(text);
const productInterest = detectProductInterest(text);
const budget = detectBudget(text);

const interestLevel = detectInterestLevel({
  intent,
  pipelineEvent,
  text
});

/*
----------------------------------------------------
OPPORTUNITY DETECTION
----------------------------------------------------
Detecta posibles ventas adicionales
*/

const opportunities = detectOpportunities(text);

     const objection = detectObjection(text);
     const closingIntent = detectClosingIntent(text);

   /*
----------------------------------------------------
STEP 4.5 — COMMERCIAL SCORING
----------------------------------------------------

Aquí calculamos el estado comercial del lead.

El Score Engine usa las señales detectadas para calcular:

• score (0 - 100)
• stage comercial del pipeline

Esto permite que EVA se comporte como un
vendedor real y no solo como un chatbot.

Ejemplo:

score >= 85 → hot lead
score >= 70 → considerando compra
score >= 50 → interesado
score < 30 → lead nuevo

Este cálculo NO toca la base de datos.
Solo genera el estado comercial.
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
STEP 5 — LEAD UPDATE
----------------------------------------------------

Actualizamos el lead en el CRM.

Además de los datos básicos ahora guardamos:

• score comercial
• stage del pipeline

Esto permite que EVA mantenga un pipeline
de ventas real.
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
----------------------------------------------------
BLOQUE 9 — UPDATE CUSTOMER MEMORY
----------------------------------------------------
*/

const updatedMemory = mergeCustomerMemory({
  memory: existingMemory,
  product_interest: productInterest,
  use_case: useCase,
  budget,
  pipeline_event: pipelineEvent
});

await pool.query(
  `
  INSERT INTO customer_profiles
  (
    organization_id,
    external_user_id,
    profile_json,
    updated_at
  )
  VALUES ($1,$2,$3,$4)
  ON CONFLICT (organization_id, external_user_id)
  DO UPDATE SET
    profile_json=$3,
    updated_at=$4
  `,
  [
    organization_id,
    phone,
    JSON.stringify(updatedMemory),
    nowIso()
  ]
);
    /*
    ----------------------------------------------------
    STEP 6 — PIPELINE EVENT
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
    STEP 7 — CATALOG SEARCH
    ----------------------------------------------------
    */

    const catalogMatches = await searchCatalog({
      organization_id,
      product_interest: productInterest
    });

   /*
----------------------------------------------------
STEP 8 — GENERATE REPLY
----------------------------------------------------

Enviamos señales comerciales al Reply Engine.

Ahora EVA también conoce:

• score del lead
• stage comercial del pipeline

Esto permite que el Reply Engine adapte la estrategia
de venta según el momento del cliente.

Ejemplo:

stage = new → educar
stage = interested → mostrar producto
stage = considering → persuadir
stage = hot → cerrar venta
*/

const reply = generateReply({
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
    STEP 9 — SAVE BOT MESSAGE
    ----------------------------------------------------
    */

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      content: reply
    });

    /*
----------------------------------------------------
RESPONSE
----------------------------------------------------

Devolvemos información útil para debug,
analytics o dashboards futuros.

Esto NO se envía al cliente final,
solo al sistema interno.
*/

return {
  reply,
  intent,
  product_interest: productInterest,
  score: leadScore,
  stage: leadStage
};

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
  budget
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
      created_at,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
    ON CONFLICT (organization_id, phone)
    DO UPDATE SET
      intent=EXCLUDED.intent,
      product_interest=COALESCE(EXCLUDED.product_interest,leads.product_interest),
      use_case=COALESCE(EXCLUDED.use_case,leads.use_case),
      budget=COALESCE(EXCLUDED.budget,leads.budget),
      updated_at=$7
    `,
    [
      organization_id,
      phone,
      intent,
      product_interest,
      use_case,
      budget,
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
     const objection = detectObjection(text);
});
     const closingIntent = detectClosingIntent(text);

    /*
    ----------------------------------------------------
    STEP 5 — LEAD UPDATE
    ----------------------------------------------------
    */

    await upsertLead({
      organization_id,
      phone,
      intent,
      product_interest: productInterest,
      use_case: useCase,
      budget
    });
/*
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
    */

  /*
----------------------------------------------------
PASS SIGNALS TO REPLY ENGINE
----------------------------------------------------

Aquí enviamos todas las señales comerciales al Reply Engine.

Esto permite que EVA adapte la respuesta según:

• intent → intención principal
• interestLevel → nivel de interés del cliente
• objection → objeciones detectadas
• closingIntent → intención de cierre o pago

IMPORTANTE:
closingIntent se introdujo en BLOQUE 8 (Closing Engine)
para permitir que EVA intente cerrar la venta cuando
detecta señales como:

"como pago"
"sinpe"
"quiero esa"
"apartar"

No eliminar este campo.
*/

/*
----------------------------------------------------
PASS SIGNALS TO REPLY ENGINE
----------------------------------------------------

Aquí enviamos todas las señales comerciales al Reply Engine.

Esto permite que EVA adapte la respuesta según:

• intent → intención principal
• interestLevel → nivel de interés del cliente
• objection → objeciones detectadas
• closingIntent → intención de cierre o pago

IMPORTANTE:
closingIntent se introdujo en BLOQUE 8 (Closing Engine)
para permitir que EVA intente cerrar la venta cuando
detecta señales como:

"como pago"
"sinpe"
"quiero esa"
"apartar"

No eliminar este campo.
*/

const reply = generateReply({
  intent,
  catalogMatches,
  interestLevel,
  objection,
  closingIntent
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
    */

    return {
      reply,
      intent,
      product_interest: productInterest
    };

  } catch (err) {

    console.error("salesBrain error", err);

    return {
      error: "brain_error",
      details: err.message || "unknown brain error"
    };

  }

}

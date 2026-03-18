/*
====================================================
EVA SALES BRAIN — CORE RESET
Orquestador limpio y estable
====================================================
*/

import pool from "./db.js";

/*
====================================================
ENGINES
====================================================
*/

import { detectIntent } from "./brain/engines/intentEngine.js";
import { detectPipelineEvent } from "./brain/engines/pipelineEngine.js";
import { detectUseCase } from "./brain/engines/useCaseEngine.js";
import { detectProductInterest } from "./brain/engines/productEngine.js";
import { detectBudget } from "./brain/engines/budgetEngine.js";
import { detectInterestLevel } from "./brain/engines/interestEngine.js";

import { searchCatalog } from "./brain/commerce/catalogEngine.js";
import { generateReply } from "./brain/replies/replyEngine.js";

/*
====================================================
UTILS
====================================================
*/

function nowIso() {
  return new Date().toISOString();
}

function safeReply(result) {
  if (!result) {
    return { text: "Con gusto te ayudo 🙌 ¿Qué estás buscando?" };
  }

  if (typeof result === "string") {
    return { text: result };
  }

  if (!result.text || result.text.trim() === "") {
    return { text: "Con gusto te ayudo 🙌 ¿Qué estás buscando?" };
  }

  return result;
}

function shouldSearchCatalog(intent) {
  return ["BUY", "INFO"].includes(intent);
}

/*
====================================================
MAIN PROCESS
====================================================
*/

export async function processMessage({
  phone,
  text,
  organization_id,
  channel = "whatsapp",
  external_message_id = null
}) {
  const now = nowIso();

  try {
    /*
    ================================================
    SAVE INBOUND MESSAGE
    ================================================
    */

    const conversation = await getOrCreateConversation({
      organization_id,
      phone,
      channel
    });

    await saveMessage({
      conversation_id: conversation.id,
      sender: "user",
      content: text,
      timestamp: now
    });

    /*
    ================================================
    DETECTION
    ================================================
    */

    const intent = detectIntent(text);
    const use_case = detectUseCase(text);
    const product_interest = detectProductInterest(text);
    const budget = detectBudget(text);
    const interestLevel = detectInterestLevel(text);

    /*
    ================================================
    CATALOG (ONLY IF APPLIES)
    ================================================
    */

    let products = [];

    if (shouldSearchCatalog(intent)) {
      try {
        products = await searchCatalog({
          organization_id,
          text
        });
      } catch (err) {
        console.error("Catalog error:", err.message);
        products = [];
      }
    }

    /*
    ================================================
    REPLY
    ================================================
    */

    let reply;

    try {
      reply = generateReply({
        intent,
        products,
        use_case,
        interestLevel
      });
    } catch (err) {
      console.error("Reply error:", err.message);
      reply = null;
    }

    const safe = safeReply(reply);

    /*
    ================================================
    STAGE LOGIC
    ================================================
    */

    let newStage = conversation.stage || "new";

    if (intent === "BUY" && products.length > 0) {
      newStage = "catalog_shown";
    }

    if (use_case === "work") {
      newStage = "qualified_work";
    }

    if (use_case === "study") {
      newStage = "qualified_study";
    }

    /*
    ================================================
    PERSIST AFTER SUCCESS
    ================================================
    */

    await saveMessage({
      conversation_id: conversation.id,
      sender: "assistant",
      content: safe.text,
      timestamp: now
    });

    await updateConversationStage(conversation.id, newStage);

    await upsertLead({
      organization_id,
      phone,
      stage: newStage,
      last_message: text,
      updated_at: now
    });

    const pipelineEvent = detectPipelineEvent(text);

    if (pipelineEvent) {
      await savePipelineEvent({
        organization_id,
        phone,
        event_type: pipelineEvent,
        created_at: now
      });
    }

    /*
    ================================================
    RESPONSE
    ================================================
    */

    return {
      reply: safe.text,
      media: safe.media || [],
      stage: newStage
    };

  } catch (err) {
    console.error("PROCESS ERROR:", err.message);

    return {
      reply: "Hubo un problema, intenta de nuevo 🙏"
    };
  }
}

/*
====================================================
DB HELPERS (SIMPLIFIED)
====================================================
*/

async function getOrCreateConversation({ organization_id, phone, channel }) {
  const result = await pool.query(
    `SELECT * FROM conversations 
     WHERE organization_id = $1 
     AND external_user_id = $2 
     AND channel = $3 
     LIMIT 1`,
    [organization_id, phone, channel]
  );

  if (result.rows.length) {
    return result.rows[0];
  }

  const insert = await pool.query(
    `INSERT INTO conversations 
     (organization_id, external_user_id, channel, stage, created_at)
     VALUES ($1, $2, $3, 'new', NOW())
     RETURNING *`,
    [organization_id, phone, channel]
  );

  return insert.rows[0];
}

async function saveMessage({ conversation_id, sender, content, timestamp }) {
  await pool.query(
    `INSERT INTO messages 
     (conversation_id, sender, content, created_at)
     VALUES ($1, $2, $3, $4)`,
    [conversation_id, sender, content, timestamp]
  );
}

async function updateConversationStage(conversation_id, stage) {
  await pool.query(
    `UPDATE conversations SET stage = $1 WHERE id = $2`,
    [stage, conversation_id]
  );
}

async function upsertLead({
  organization_id,
  phone,
  stage,
  last_message,
  updated_at
}) {
  await pool.query(
    `INSERT INTO leads (organization_id, phone, stage, last_message, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (organization_id, phone)
     DO UPDATE SET
       stage = EXCLUDED.stage,
       last_message = EXCLUDED.last_message,
       updated_at = EXCLUDED.updated_at`,
    [organization_id, phone, stage, last_message, updated_at]
  );
}

async function savePipelineEvent({
  organization_id,
  phone,
  event_type,
  created_at
}) {
  await pool.query(
    `INSERT INTO pipeline_events (organization_id, phone, event_type, created_at)
     VALUES ($1, $2, $3, $4)`,
    [organization_id, phone, event_type, created_at]
  );
}

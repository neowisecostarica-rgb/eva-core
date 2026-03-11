import pool from "./db.js";

/*
========================================
UTILS
========================================
*/

function now() {
  return new Date();
}

/*
========================================
INTENT DETECTION (simple heurística)
========================================
*/

function detectIntent(text) {

  const t = text.toLowerCase();

  if (t.includes("precio") || t.includes("cuesta") || t.includes("vale")) {
    return "BUY";
  }

  if (t.includes("información") || t.includes("info")) {
    return "INFO";
  }

  if (t.includes("hola") || t.includes("buenas")) {
    return "GREETING";
  }

  return "UNKNOWN";
}

/*
========================================
STAGE DETECTION
========================================
*/

function detectStage(intent) {

  if (intent === "BUY") return "QUALIFYING";

  if (intent === "INFO") return "DISCOVERY";

  return "DISCOVERY";

}

/*
========================================
LEAD SCORE
========================================
*/

function calculateLeadScore(intent) {

  if (intent === "BUY") return 80;

  if (intent === "INFO") return 50;

  return 20;

}

/*
========================================
ENSURE CONVERSATION
========================================
*/

async function ensureConversation(
  organization_id,
  phone,
  channel
) {

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

  const created = await pool.query(
    `
    INSERT INTO conversations (
      organization_id,
      external_user_id,
      channel,
      stage,
      control_mode,
      created_at,
      updated_at
    )
    VALUES ($1,$2,$3,'DISCOVERY','HYBRID',NOW(),NOW())
    RETURNING *
    `,
    [organization_id, phone, channel]
  );

  return created.rows[0];

}

/*
========================================
SAVE MESSAGE
========================================
*/

async function saveMessage({
  organization_id,
  conversation_id,
  role,
  content
}) {

  await pool.query(
    `
    INSERT INTO messages (
      organization_id,
      conversation_id,
      role,
      content,
      created_at
    )
    VALUES ($1,$2,$3,$4,NOW())
    `,
    [
      organization_id,
      conversation_id,
      role,
      content
    ]
  );

}

/*
========================================
UPSERT LEAD
========================================
*/

async function upsertLead({
  organization_id,
  phone,
  lead_score,
  stage
}) {

  const result = await pool.query(
    `
    SELECT *
    FROM leads
    WHERE organization_id = $1
      AND phone = $2
    LIMIT 1
    `,
    [organization_id, phone]
  );

  if (result.rows.length > 0) {

    await pool.query(
      `
      UPDATE leads
      SET score = $1,
          stage = $2,
          updated_at = NOW()
      WHERE id = $3
      `,
      [
        lead_score,
        stage,
        result.rows[0].id
      ]
    );

    return result.rows[0];

  }

  const created = await pool.query(
    `
    INSERT INTO leads (
      organization_id,
      phone,
      score,
      stage,
      created_at,
      updated_at
    )
    VALUES ($1,$2,$3,$4,NOW(),NOW())
    RETURNING *
    `,
    [
      organization_id,
      phone,
      lead_score,
      stage
    ]
  );

  return created.rows[0];

}

/*
========================================
CREATE FOLLOWUP IF NEEDED
========================================
*/

async function createFollowupIfNeeded({
  organization_id,
  conversation_id,
  lead_phone,
  lead_score,
  stage
}) {

  if (!lead_score || lead_score < 40) return;

  if (stage === "CLOSED") return;

  let hours = 24;

  if (lead_score >= 80) hours = 12;
  else if (lead_score >= 60) hours = 24;
  else hours = 36;

  await pool.query(
    `
    INSERT INTO followups (
      organization_id,
      conversation_id,
      lead_phone,
      reason,
      attempt,
      status,
      due_at,
      created_at,
      updated_at
    )
    VALUES (
      $1,$2,$3,'abandoned_chat',1,'pending',NOW() + ($4 || ' hours')::interval,NOW(),NOW()
    )
    `,
    [
      organization_id,
      conversation_id,
      lead_phone,
      hours
    ]
  );

}

/*
========================================
GENERATE REPLY
========================================
*/

function generateReply(intent) {

  if (intent === "BUY") {

    return "Perfecto 👍 puedo ayudarte a elegir la mejor opción según tu presupuesto. ¿Qué tipo de laptop estás buscando?";

  }

  if (intent === "INFO") {

    return "Claro 🙂 con gusto te comparto la información. ¿Qué equipo estás buscando?";

  }

  if (intent === "GREETING") {

    return "Hola 👋 soy Eva de Compu Store. ¿En qué puedo ayudarte hoy?";

  }

  return "Cuéntame qué equipo estás buscando y con gusto te ayudo a elegir la mejor opción.";

}

/*
========================================
HANDLE INBOUND
========================================
*/

export async function handleInbound({
  organization_id,
  payload
}) {

  try {

    const phone = payload.from;
    const text = payload.text || "";
    const channel = payload.channel || "whatsapp";

    /*
    Detect intent
    */

    const intent = detectIntent(text);

    /*
    Detect stage
    */

    const stage = detectStage(intent);

    /*
    Lead score
    */

    const lead_score = calculateLeadScore(intent);

    /*
    Conversation
    */

    const conversation = await ensureConversation(
      organization_id,
      phone,
      channel
    );

    /*
    Save user message
    */

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "user",
      content: text
    });

    /*
    Upsert lead
    */

    const lead = await upsertLead({
      organization_id,
      phone,
      lead_score,
      stage
    });

    /*
    Generate reply
    */

    const reply = generateReply(intent);

    /*
    Save assistant message
    */

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      content: reply
    });

    /*
    Create followup
    */

    await createFollowupIfNeeded({
      organization_id,
      conversation_id: conversation.id,
      lead_phone: phone,
      lead_score,
      stage
    });

    return {

      ok: true,
      reply,
      intent,
      stage,
      lead_score,
      conversation_id: conversation.id,
      lead_id: lead.id

    };

  } catch (err) {

    console.error("salesBrain error", err);

    return {
      error: "brain_error"
    };

  }

}

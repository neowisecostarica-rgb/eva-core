import pool from "./db.js";

/*
====================================================
INTENT DETECTION
====================================================
*/

function detectIntent(text) {

  const t = String(text || "").toLowerCase();

  if (
    t.includes("precio") ||
    t.includes("cuanto cuesta") ||
    t.includes("cuánto cuesta") ||
    t.includes("vale") ||
    t.includes("comprar") ||
    t.includes("disponible")
  ) {
    return "BUY";
  }

  if (
    t.includes("informacion") ||
    t.includes("información") ||
    t.includes("caracteristicas") ||
    t.includes("características")
  ) {
    return "INFO";
  }

  if (
    t.includes("hola") ||
    t.includes("buenas") ||
    t.includes("buenos dias") ||
    t.includes("buenos días")
  ) {
    return "GREETING";
  }

  return "UNKNOWN";

}

/*
====================================================
STAGE DETECTION
====================================================
*/

function detectStage(intent) {

  if (intent === "BUY") return "QUALIFYING";
  if (intent === "INFO") return "DISCOVERY";
  if (intent === "GREETING") return "DISCOVERY";

  return "DISCOVERY";

}

/*
====================================================
LEAD SCORE
====================================================
*/

function calculateLeadScore(intent) {

  if (intent === "BUY") return 80;
  if (intent === "INFO") return 50;
  if (intent === "GREETING") return 20;

  return 10;

}

/*
====================================================
PIPELINE EVENT DETECTION
====================================================
*/

function detectPipelineEvent(text) {

  const t = String(text || "").toLowerCase();

  if (t.includes("precio") || t.includes("cuanto cuesta")) {
    return "PRICE_REQUEST";
  }

  if (t.includes("fotos") || t.includes("imagen")) {
    return "CATALOG_REQUEST";
  }

  if (t.includes("comprar") || t.includes("la quiero")) {
    return "READY_TO_BUY";
  }

  if (t.includes("hola") || t.includes("buenas")) {
    return "GREETING";
  }

  return "QUESTION";

}

/*
====================================================
SAVE PIPELINE EVENT
====================================================
*/

async function savePipelineEvent({
  organization_id,
  conversation_id,
  lead_id,
  event_type,
  metadata = null
}) {

  try {

    await pool.query(
      `
      INSERT INTO pipeline_events (
        organization_id,
        conversation_id,
        lead_id,
        event_type,
        metadata,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,NOW())
      `,
      [
        organization_id,
        conversation_id,
        lead_id,
        event_type,
        metadata
      ]
    );

  } catch (err) {

    console.error("pipeline event error", err);

  }

}

/*
====================================================
ENSURE CONVERSATION
====================================================
*/

async function ensureConversation(
  organization_id,
  phone,
  channel = "whatsapp"
) {

  const existing = await pool.query(
    `
    SELECT *
    FROM conversations
    WHERE organization_id = $1
      AND external_user_id = $2
      AND channel = $3
    ORDER BY created_at ASC
    LIMIT 1
    `,
    [organization_id, phone, channel]
  );

  if (existing.rows.length > 0) {

    const conversation = existing.rows[0];

    await pool.query(
      `
      UPDATE conversations
      SET updated_at = NOW(),
          last_message_at = NOW()
      WHERE id = $1
      `,
      [conversation.id]
    );

    return conversation;

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
      updated_at,
      last_message_at
    )
    VALUES ($1,$2,$3,'DISCOVERY','HYBRID',NOW(),NOW(),NOW())
    RETURNING *
    `,
    [organization_id, phone, channel]
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
  content
}) {

  const result = await pool.query(
    `
    INSERT INTO messages (
      organization_id,
      conversation_id,
      role,
      content,
      created_at
    )
    VALUES ($1,$2,$3,$4,NOW())
    RETURNING *
    `,
    [organization_id, conversation_id, role, content]
  );

  return result.rows[0];

}

/*
====================================================
UPSERT LEAD
====================================================
*/

async function upsertLead({
  organization_id,
  phone,
  lead_score,
  stage
}) {

  const existing = await pool.query(
    `
    SELECT *
    FROM leads
    WHERE organization_id = $1
      AND phone = $2
    LIMIT 1
    `,
    [organization_id, phone]
  );

  if (existing.rows.length > 0) {

    const lead = existing.rows[0];

    const updated = await pool.query(
      `
      UPDATE leads
      SET score = $1,
          stage = $2,
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
      `,
      [lead_score, stage, lead.id]
    );

    return updated.rows[0];

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
    [organization_id, phone, lead_score, stage]
  );

  return created.rows[0];

}

/*
====================================================
CREATE FOLLOWUP
====================================================
*/

async function createFollowupIfNeeded({
  organization_id,
  conversation_id,
  lead_phone,
  lead_score
}) {

  if (lead_score < 40) return;

  const exists = await pool.query(
    `
    SELECT id
    FROM followups
    WHERE conversation_id = $1
      AND status = 'pending'
    LIMIT 1
    `,
    [conversation_id]
  );

  if (exists.rows.length > 0) return;

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
      $1,$2,$3,'abandoned_chat',1,'pending',
      NOW() + interval '24 hours',
      NOW(),
      NOW()
    )
    `,
    [
      organization_id,
      conversation_id,
      lead_phone
    ]
  );

}

/*
====================================================
GENERATE REPLY
====================================================
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

  return "Cuéntame qué equipo estás buscando y con gusto te ayudo.";

}

/*
====================================================
HANDLE INBOUND
====================================================
*/

export async function handleInbound({
  organization_id,
  payload
}) {

  try {

    const phone = String(payload.phone || "").trim();
    const text = String(payload.message || "").trim();
    const channel = String(payload.channel || "whatsapp").toLowerCase();

    const intent = detectIntent(text);
    const stage = detectStage(intent);
    const lead_score = calculateLeadScore(intent);

    const pipeline_event = detectPipelineEvent(text);

    const conversation = await ensureConversation(
      organization_id,
      phone,
      channel
    );

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "user",
      content: text
    });

    const lead = await upsertLead({
      organization_id,
      phone,
      lead_score,
      stage
    });

    await savePipelineEvent({
      organization_id,
      conversation_id: conversation.id,
      lead_id: lead.id,
      event_type: pipeline_event,
      metadata: { message: text }
    });

    const reply = generateReply(intent);

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      content: reply
    });

    await createFollowupIfNeeded({
      organization_id,
      conversation_id: conversation.id,
      lead_phone: phone,
      lead_score
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
      error: "brain_error",
      details: err.message
    };

  }

}

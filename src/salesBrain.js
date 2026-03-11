import pool from "./db.js";

/*
========================================
INTENT DETECTION
========================================
*/

function detectIntent(text) {
  const t = String(text || "").toLowerCase();

  if (
    t.includes("precio") ||
    t.includes("cuesta") ||
    t.includes("vale") ||
    t.includes("comprar") ||
    t.includes("disponible")
  ) {
    return "BUY";
  }

  if (
    t.includes("informacion") ||
    t.includes("información") ||
    t.includes("info") ||
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
========================================
STAGE DETECTION
========================================
*/

function detectStage(intent) {
  if (intent === "BUY") return "QUALIFYING";
  if (intent === "INFO") return "DISCOVERY";
  if (intent === "GREETING") return "DISCOVERY";
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
  if (intent === "GREETING") return 20;
  return 10;
}

/*
========================================
ENSURE CONVERSATION
========================================
*/

async function ensureConversation(organization_id, phone, channel = "whatsapp") {
  const existing = await pool.query(
    `
    SELECT *
    FROM conversations
    WHERE organization_id = $1
      AND external_user_id = $2
      AND channel = $3
    ORDER BY created_at ASC NULLS LAST, id ASC
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
    const current = existing.rows[0];

    const updated = await pool.query(
      `
      UPDATE leads
      SET score = $1,
          stage = $2,
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
      `,
      [lead_score, stage, current.id]
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

  const alreadyPending = await pool.query(
    `
    SELECT id
    FROM followups
    WHERE organization_id = $1
      AND conversation_id = $2
      AND status = 'pending'
    LIMIT 1
    `,
    [organization_id, conversation_id]
  );

  if (alreadyPending.rows.length > 0) return;

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
    [organization_id, conversation_id, lead_phone, hours]
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
    const phone = String(payload?.phone || "").trim();
    const text = String(payload?.message || "").trim();
    const channel = String(payload?.channel || "whatsapp").trim().toLowerCase();

    if (!organization_id) {
      throw new Error("organization_id missing in handleInbound");
    }

    if (!phone) {
      throw new Error("phone missing in handleInbound");
    }

    if (!text) {
      throw new Error("message missing in handleInbound");
    }

    const intent = detectIntent(text);
    const stage = detectStage(intent);
    const lead_score = calculateLeadScore(intent);

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

    const reply = generateReply(intent);

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      content: reply
    });

    await pool.query(
      `
      UPDATE conversations
      SET stage = $1,
          updated_at = NOW(),
          last_message_at = NOW()
      WHERE id = $2
      `,
      [stage, conversation.id]
    );

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
      error: "brain_error",
      details: err.message || "unknown brain error"
    };
  }
}

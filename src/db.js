import pkg from "pg";

const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not defined");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("connect", () => {
  console.log("✅ PostgreSQL connected");
});

pool.on("error", (err) => {
  console.error("❌ Unexpected PostgreSQL error", err);
});

/*
========================================
UTILS
========================================
*/

function assertOrg(organization_id) {
  if (!organization_id) {
    throw new Error("❌ organization_id is required (SOT violation)");
  }
}

function safe(v) {
  return String(v || "").trim();
}

/*
========================================
FIND OR CREATE LEAD
========================================
*/

export async function findOrCreateLead({ organization_id, phone }) {
  try {
    assertOrg(organization_id);

    if (!phone) {
      throw new Error("phone is required");
    }

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
        SET last_contact_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
          AND organization_id = $2
        RETURNING *
        `,
        [lead.id, organization_id]
      );

      return updated.rows[0] || lead;
    }

    const created = await pool.query(
      `
      INSERT INTO leads (
        organization_id,
        phone,
        score,
        stage,
        status,
        created_at,
        updated_at,
        last_contact_at
      )
      VALUES (
        $1,
        $2,
        0,
        'new',
        'active',
        NOW(),
        NOW(),
        NOW()
      )
      RETURNING *
      `,
      [organization_id, phone]
    );

    return created.rows[0];

  } catch (err) {
    console.error("❌ findOrCreateLead error:", err);
    throw err; // 🔥 FIX: no devolver null
  }
}

/*
========================================
CONVERSATIONS
========================================
*/

export async function findOrCreateConversation({
  organization_id,
  phone,
  channel,
}) {
  try {
    assertOrg(organization_id);

    if (!phone || !channel) {
      throw new Error("phone and channel required");
    }

    const existing = await pool.query(
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

    if (existing.rows.length > 0) {
      const conversation = existing.rows[0];

      const updated = await pool.query(
        `
        UPDATE conversations
        SET updated_at = NOW(),
            last_message_at = NOW()
        WHERE id = $1
          AND organization_id = $2
        RETURNING *
        `,
        [conversation.id, organization_id]
      );

      return updated.rows[0] || conversation;
    }

    const created = await pool.query(
      `
      INSERT INTO conversations (
        organization_id,
        external_user_id,
        channel,
        created_at,
        updated_at,
        last_message_at
      )
      VALUES ($1, $2, $3, NOW(), NOW(), NOW())
      RETURNING *
      `,
      [organization_id, phone, channel]
    );

    return created.rows[0];

  } catch (err) {
    console.error("❌ findOrCreateConversation error:", err);
    throw err;
  }
}

/*
========================================
SAVE MESSAGE
========================================
*/

export async function saveMessage({
  organization_id,
  conversation_id,
  role,
  text,
  message_id = null,
}) {
  try {
    assertOrg(organization_id);

    if (!conversation_id || !role) {
      throw new Error("conversation_id and role required");
    }

    const content = safe(text);

    if (!content) return;

    await pool.query(
      `
      INSERT INTO messages (
        organization_id,
        conversation_id,
        role,
        content,
        external_message_id,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      `,
      [organization_id, conversation_id, role, content, message_id]
    );

    await pool.query(
      `
      UPDATE conversations
      SET last_message_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
        AND organization_id = $2
      `,
      [conversation_id, organization_id]
    );

  } catch (err) {
    console.error("❌ saveMessage error:", err);
    throw err;
  }
}

/*
====================================================
SAVE PIPELINE EVENT (FIX JSONB)
====================================================
*/

export async function savePipelineEvent({
  organization_id,
  conversation_id,
  lead_phone = null,
  event_type,
  event_data = {},
}) {
  try {
    await db.query(
      `
      INSERT INTO pipeline_events (
        organization_id,
        conversation_id,
        lead_phone,
        event_type,
        event_data,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
      `,
      [
        organization_id,
        conversation_id,
        lead_phone,
        event_type,
        JSON.stringify(event_data || {}), // 🔥 CLAVE
      ]
    );
  } catch (err) {
    console.error("savePipelineEvent error", err.message);
  }
}

/*
========================================
UPDATE LEAD STAGE + SCORE
========================================
*/

export async function updateLeadStageAndScore({
  organization_id,
  lead_id,
  new_stage,
  new_score,
}) {
  try {
    assertOrg(organization_id);

    await pool.query(
      `
      UPDATE leads
      SET 
        stage = CASE
          WHEN stage = 'hot' THEN stage
          ELSE $3
        END,
        score = GREATEST(score, $4),
        last_contact_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND organization_id = $2
      `,
      [lead_id, organization_id, new_stage, new_score]
    );

  } catch (err) {
    console.error("❌ updateLeadStageAndScore error:", err);
  }
}

/*
========================================
UPDATE LEAD MEMORY
========================================
*/

export async function updateLeadMemory({
  organization_id,
  lead_id,
  memory = {},
}) {
  try {
    assertOrg(organization_id);

    const {
      budget = null,
      use_case = null,
      product_interest = null,
      interest_level = null,
      last_intent = null,
    } = memory;

    await pool.query(
      `
      UPDATE leads
      SET
        budget = COALESCE($3, budget),
        use_case = COALESCE($4, use_case),
        product_interest = COALESCE($5, product_interest),
        interest_level = COALESCE($6, interest_level),
        last_intent = COALESCE($7, last_intent),
        updated_at = NOW()
      WHERE id = $1
        AND organization_id = $2
      `,
      [
        lead_id,
        organization_id,
        budget,
        use_case,
        product_interest,
        interest_level,
        last_intent,
      ]
    );

  } catch (err) {
    console.error("❌ updateLeadMemory error:", err);
  }
}

/*
========================================
ORG SETTINGS
========================================
*/

export async function getOrganizationSettings(organization_id) {
  try {
    assertOrg(organization_id);

    const result = await pool.query(
      `
      SELECT *
      FROM organization_settings
      WHERE organization_id = $1
      LIMIT 1
      `,
      [organization_id]
    );

    return result.rows[0] || null;

  } catch (err) {
    console.error("❌ getOrganizationSettings error:", err);
    return null;
  }
}

export default pool;

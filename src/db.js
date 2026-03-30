import pkg from "pg";

const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not defined");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("connect", () => {
  console.log("PostgreSQL connected");
  console.log("🧪 DATABASE_URL:", process.env.DATABASE_URL);
});

pool.on("error", (err) => {
  console.error("❌ Unexpected PostgreSQL error", err);
});

/*
========================================
FIND OR CREATE LEAD (SOT CRM)
========================================
*/

export async function findOrCreateLead({ organization_id, phone }) {
  try {
    const existing = await pool.query(
      `
      SELECT * 
      FROM leads 
      WHERE organization_id = $1 AND phone = $2
      LIMIT 1
      `,
      [organization_id, phone]
    );

    if (existing.rows.length > 0) {
      const lead = existing.rows[0];

      await pool.query(
        `
        UPDATE leads
        SET last_contact_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        AND organization_id = $2
        `,
        [lead.id, organization_id]
      );

      return lead;
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
    return null;
  }
}

/*
========================================
CONVERSATIONS + MESSAGES
========================================
*/

export async function findOrCreateConversation({
  organization_id,
  phone,
  channel,
}) {
  try {
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
      return existing.rows[0];
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
    return null;
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
      [organization_id, conversation_id, role, text, message_id]
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

    console.log("💬 Message saved");
  } catch (err) {
    console.error("❌ saveMessage error:", err);
  }
}

export default pool;
/*
========================================
PIPELINE EVENTS
========================================
*/

export async function savePipelineEvent({
  organization_id,
  lead_id,
  event_type,
  metadata = {},
}) {
  try {
    await pool.query(
      `
      INSERT INTO pipeline_events (
        organization_id,
        lead_id,
        event_type,
        metadata,
        created_at
      )
      VALUES ($1, $2, $3, $4, NOW())
      `,
      [organization_id, lead_id, event_type, JSON.stringify(metadata)]
    );
  } catch (err) {
    console.error("❌ savePipelineEvent error:", err);
  }
}

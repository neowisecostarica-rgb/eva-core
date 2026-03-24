import pkg from "pg";

const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not defined");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
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
    /*
    ========================================
    1. BUSCAR LEAD EXISTENTE
    ========================================
    */

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

      // opcional: actualizar last_contact_at
      await pool.query(
        `
        UPDATE leads
        SET last_contact_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        `,
        [lead.id]
      );

      return lead;
    }

    /*
    ========================================
    2. CREAR NUEVO LEAD
    ========================================
    */

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

export default pool;

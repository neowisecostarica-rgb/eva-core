// server.js (EVA Core - Full)
// Requires: npm i express dotenv openai pg
// Env needed: OPENAI_API_KEY, DATABASE_URL
// Optional: DATABASE_SSL=true, ADMIN_API_KEY, USE_LLM_INTENT=true

import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import pkg from "pg";
import crypto from "crypto";

dotenv.config();

const { Pool } = pkg;

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ----------------------------- UTILITIES ----------------------------- */

function nowISO() {
  return new Date().toISOString();
}

function getPeriodYYYYMM() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function normalizePhone(external_user_id) {
  return String(external_user_id || "").trim();
}

function makeApiKey() {
  return "eva_" + crypto.randomBytes(20).toString("hex");
}

/* ----------------------------- SCHEMA SETUP ----------------------------- */

async function ensureSchema() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      api_key TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'ACTIVE',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id),
      phone TEXT,
      email TEXT,
      instagram TEXT,
      source TEXT,
      status TEXT DEFAULT 'NEW',
      stage TEXT DEFAULT 'NEW',
      budget TEXT,
      use_case TEXT,
      interest_level TEXT DEFAULT 'LOW',
      intent TEXT,
      score INTEGER DEFAULT 0,
      last_contact_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (organization_id, phone)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id),
      external_user_id TEXT NOT NULL,
      channel TEXT,
      summary TEXT,
      stage TEXT DEFAULT 'DISCOVERY',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (organization_id, external_user_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id),
      conversation_id UUID REFERENCES conversations(id),
      role TEXT,
      content TEXT,
      meta JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS eva_usage (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id),
      period TEXT NOT NULL,
      inbound_messages_count INTEGER DEFAULT 0,
      ai_responses_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (organization_id, period)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pipeline_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id),
      lead_phone TEXT NOT NULL,
      from_stage TEXT,
      to_stage TEXT NOT NULL,
      reason TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS followups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id),
      lead_phone TEXT NOT NULL,
      conversation_id UUID REFERENCES conversations(id),
      due_at TIMESTAMP NOT NULL,
      status TEXT DEFAULT 'PENDING',
      reason TEXT,
      payload JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id),
      lead_phone TEXT NOT NULL,
      conversation_id UUID REFERENCES conversations(id),
      requested_at TIMESTAMP DEFAULT NOW(),
      requested_date TEXT,
      requested_time TEXT,
      notes TEXT,
      status TEXT DEFAULT 'REQUESTED'
    );
  `);
}

/* ----------------------------- AUTH + RATE LIMIT ----------------------------- */

async function getOrgByApiKey(apiKey) {
  const r = await pool.query(`SELECT * FROM organizations WHERE api_key=$1 AND status='ACTIVE'`, [apiKey]);
  return r.rows[0] || null;
}

const rateState = new Map();

function rateLimit(apiKey, limitPerMinute = 60) {

  const now = Date.now();
  const windowMs = 60000;

  const entry = rateState.get(apiKey) || { windowStart: now, count: 0 };

  if (now - entry.windowStart > windowMs) {
    entry.windowStart = now;
    entry.count = 0;
  }

  entry.count += 1;

  rateState.set(apiKey, entry);

  // FIX: cleanup old entries to avoid memory growth
  if (rateState.size > 10000) {
    rateState.clear();
  }

  return entry.count <= limitPerMinute;
}

/* ----------------------------- FOLLOW-UP ENGINE ----------------------------- */

async function scheduleFollowUp({ organization_id, lead_phone, conversation_id, minutesFromNow, reason, payload }) {

  const dueAt = new Date(Date.now() + minutesFromNow * 60_000);

  // FIX: prevent duplicate followups
  const existing = await pool.query(
    `
    SELECT id FROM followups
    WHERE organization_id=$1
    AND lead_phone=$2
    AND status='PENDING'
    AND due_at > NOW()
    LIMIT 1
    `,
    [organization_id, lead_phone]
  );

  if (existing.rows.length > 0) {
    return;
  }

  await pool.query(
    `
    INSERT INTO followups
    (organization_id, lead_phone, conversation_id, due_at, reason, payload)
    VALUES ($1,$2,$3,$4,$5,$6)
    `,
    [organization_id, lead_phone, conversation_id, dueAt, reason || null, payload ? JSON.stringify(payload) : null]
  );
}

/* ----------------------------- API HEALTH ----------------------------- */

app.get("/", (req, res) => {
  res.json({
    status: "EVA Core running 🚀",
    version: "4.1",
    time: nowISO(),
  });
});

/* ----------------------------- WHATSAPP WEBHOOK ----------------------------- */

// Verification endpoint (Meta requires this)
app.get("/v1/webhooks/whatsapp", (req, res) => {

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === verifyToken) {
    console.log("WhatsApp webhook verified");
    return res.status(200).send(challenge);
  }

  res.sendStatus(403);
});


// Incoming messages from WhatsApp
app.post("/v1/webhooks/whatsapp", async (req, res) => {

  try {

    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    const message = value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    const from = message.from;

    let text = null;
    let audioUrl = null;

    if (message.text) {
      text = message.text.body;
    }

    if (message.audio) {
      audioUrl = message.audio.id; // later we fetch media
    }

    // Send message to EVA engine
    const response = await fetch(`${process.env.EVA_BASE_URL}/v1/messages/inbound`, {

      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        api_key: process.env.EVA_DEFAULT_API_KEY,
        external_user_id: from,
        text: text,
        audio_url: audioUrl,
        channel: "whatsapp"
      })

    });

    const eva = await response.json();

    // Send reply back to WhatsApp
    await fetch(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {

      method: "POST",

      headers: {
        "Authorization": `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: from,
        text: {
          body: eva.reply
        }
      })

    });

    res.sendStatus(200);

  } catch (err) {

    console.error("WhatsApp webhook error", err);
    res.sendStatus(500);

  }

});
/* ----------------------------- ADMIN ----------------------------- */

function requireAdmin(req, res, next) {

  const adminKey = process.env.ADMIN_API_KEY;

  // FIX: block if admin key not configured
  if (!adminKey) {
    return res.status(403).json({ error: "ADMIN_API_KEY not configured" });
  }

  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (token !== adminKey) {
    return res.status(403).json({ error: "Forbidden" });
  }

  next();
}

app.post("/v1/admin/orgs", requireAdmin, async (req, res) => {

  const { name } = req.body || {};

  if (!name) return res.status(400).json({ error: "Missing name" });

  const apiKey = makeApiKey();

  const r = await pool.query(
    `INSERT INTO organizations (name, api_key) VALUES ($1,$2) RETURNING *`,
    [name, apiKey]
  );

  res.json({ organization: r.rows[0] });

});

/* ----------------------------- READ API ----------------------------- */

app.get("/v1/conversations", async (req, res) => {

  try {

    // FIX: unified auth using Authorization header
    const apiKey = req.headers.authorization?.replace("Bearer ", "");

    if (!apiKey) {
      return res.status(401).json({ error: "Missing Authorization Bearer" });
    }

    const org = await getOrgByApiKey(apiKey);

    if (!org) {
      return res.status(401).json({ error: "Invalid API Key" });
    }

    const result = await pool.query(`
      SELECT 
        c.id AS conversation_id,
        c.external_user_id,
        l.intent,
        l.score,
        l.stage,
        l.interest_level,
        (
          SELECT content
          FROM messages
          WHERE conversation_id = c.id
          ORDER BY created_at DESC
          LIMIT 1
        ) AS last_message
      FROM conversations c
      LEFT JOIN leads l 
        ON l.phone = c.external_user_id
      WHERE c.organization_id = $1
      ORDER BY c.created_at DESC
    `, [org.id]);

    res.json({ conversations: result.rows });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }

});

/* ----------------------------- STARTUP ----------------------------- */

(async () => {
  try {

    await ensureSchema();

    // FIX: removed duplicated conversations endpoint that existed here

    app.listen(PORT, () => {
      console.log(`EVA running on port ${PORT}`);
    });

  } catch (e) {

    console.error("Startup failed:", e);
    process.exit(1);

  }
})();

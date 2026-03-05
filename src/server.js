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
  // Keep as-is (multi-industry). If it's WhatsApp later, external_user_id may include prefixes.
  return String(external_user_id || "").trim();
}

function makeApiKey() {
  return "eva_" + crypto.randomBytes(20).toString("hex");
}

/* ----------------------------- SCHEMA SETUP ----------------------------- */
/**
 * Idempotent schema creation so you don't have to fight migrations now.
 * Safe to run on startup: uses IF NOT EXISTS.
 */
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

  // Follow-ups queue (simple)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS followups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id),
      lead_phone TEXT NOT NULL,
      conversation_id UUID REFERENCES conversations(id),
      due_at TIMESTAMP NOT NULL,
      status TEXT DEFAULT 'PENDING', -- PENDING | SENT | CANCELLED
      reason TEXT,
      payload JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Booking requests (agnostic: later you connect calendar / human ops)
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
      status TEXT DEFAULT 'REQUESTED' -- REQUESTED | CONFIRMED | CANCELLED | DONE
    );
  `);
}

/* ----------------------------- AUTH + RATE LIMIT ----------------------------- */

async function getOrgByApiKey(apiKey) {
  const r = await pool.query(`SELECT * FROM organizations WHERE api_key=$1 AND status='ACTIVE'`, [apiKey]);
  return r.rows[0] || null;
}

// Minimal in-memory rate limiter per api_key (good enough for now; later move to Redis)
const rateState = new Map();
function rateLimit(apiKey, limitPerMinute = 60) {
  const now = Date.now();
  const windowMs = 60_000;

  const entry = rateState.get(apiKey) || { windowStart: now, count: 0 };
  if (now - entry.windowStart > windowMs) {
    entry.windowStart = now;
    entry.count = 0;
  }
  entry.count += 1;
  rateState.set(apiKey, entry);

  return entry.count <= limitPerMinute;
}

/* ----------------------------- INTENT + SCORING ----------------------------- */

// Universal intent set
const INTENTS = ["GREETING", "INFO", "BUY", "SUPPORT", "BOOKING", "OTHER"];

// Fast heuristic intent (no LLM)
function heuristicIntent(text) {
  const t = (text || "").toLowerCase();

  const has = (...words) => words.some((w) => t.includes(w));

  if (has("hola", "buenas", "buenos", "saludos", "hey")) return "GREETING";
  if (has("cita", "agendar", "agenda", "reservar", "visita", "reunión", "reunion")) return "BOOKING";
  if (has("dañado", "danado", "no sirve", "falla", "error", "garantía", "garantia", "soporte", "repar", "arreglar")) return "SUPPORT";
  if (has("precio", "cuesta", "vale", "comprar", "pago", "apart", "disponible", "envío", "envio", "tasa 0")) return "BUY";
  if (t.length <= 3) return "GREETING";
  return "INFO";
}

// Optional: LLM intent classifier (more accurate; toggle with USE_LLM_INTENT=true)
async function llmIntent(text) {
  const sys = `Classify the user message into exactly ONE of:
${INTENTS.join("\n")}
Return ONLY the intent word. No punctuation.`;

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: text || "" },
    ],
  });

  const out = (resp.choices?.[0]?.message?.content || "").trim().toUpperCase();
  return INTENTS.includes(out) ? out : "OTHER";
}

function extractBudget(text) {
  const t = (text || "").toLowerCase();

  // Find numbers like 200000, 200 mil, ¢200000, 200k, 200.000
  const cleaned = t.replace(/[.,]/g, "");
  const num = cleaned.match(/(\d{2,9})/);
  if (!num) return null;

  const raw = num[1];
  // If they said "mil" near it, interpret as *1000 if number is small
  const idx = cleaned.indexOf(raw);
  const around = cleaned.slice(Math.max(0, idx - 10), idx + raw.length + 10);
  let value = parseInt(raw, 10);

  if (around.includes("mil") && value < 1000) value = value * 1000;
  if (around.includes("k") && value < 10000) value = value * 1000;

  return String(value);
}

function extractUseCase(text) {
  const t = (text || "").toLowerCase();
  if (t.includes("colegio") || t.includes("escuela") || t.includes("estudio") || t.includes("tareas")) return "STUDY";
  if (t.includes("trabajo") || t.includes("oficina") || t.includes("empresa") || t.includes("excel")) return "WORK";
  if (t.includes("gaming") || t.includes("juegos") || t.includes("victus") || t.includes("fps")) return "GAMING";
  if (t.includes("diseño") || t.includes("diseno") || t.includes("adobe") || t.includes("autocad")) return "DESIGN";
  return null;
}

function computeLeadScore({ intent, budget, useCase, text }) {
  let score = 10;

  // Base by intent
  if (intent === "BUY") score += 60;
  else if (intent === "BOOKING") score += 55;
  else if (intent === "INFO") score += 25;
  else if (intent === "SUPPORT") score += 20;
  else if (intent === "GREETING") score += 5;
  else score += 10;

  // Budget mention
  if (budget) score += 10;

  // Use case clarity
  if (useCase) score += 8;

  // Urgency cues
  const t = (text || "").toLowerCase();
  if (t.includes("hoy") || t.includes("ya") || t.includes("urgente") || t.includes("para mañana") || t.includes("para manana")) score += 8;
  if (t.includes("apartar") || t.includes("reservar") || t.includes("última") || t.includes("ultima")) score += 6;

  if (score > 100) score = 100;
  return score;
}

function interestLevelFromScore(score) {
  if (score >= 75) return "HIGH";
  if (score >= 45) return "MEDIUM";
  return "LOW";
}

function stageFromIntentAndScore(intent, score) {
  // Simple universal pipeline:
  // NEW -> DISCOVERY -> QUALIFIED -> HOT -> BOOKED -> SUPPORT
  if (intent === "SUPPORT") return "SUPPORT";
  if (intent === "BOOKING") return "BOOKING";
  if (intent === "BUY" && score >= 80) return "HOT";
  if ((intent === "BUY" || intent === "BOOKING") && score >= 60) return "QUALIFIED";
  if (intent === "INFO" && score >= 45) return "DISCOVERY";
  if (intent === "GREETING") return "NEW";
  return "DISCOVERY";
}

/* ----------------------------- AI RESPONSE ----------------------------- */

async function buildAIReply({ orgName, intent, text, history }) {
  // Keep it multi-industry; ask questions that progress sales/support/booking.
  const sys = `
You are EVA, an AI sales assistant working for: "${orgName}".

Goals:
- Be helpful, short, and friendly.
- Move the conversation forward.
- Ask 1-2 questions max.
- If intent=BUY: qualify (use-case, budget if missing, timeline) and suggest next action.
- If intent=BOOKING: ask preferred day/time and capture details.
- If intent=SUPPORT: ask device/service details and next step (diagnostic / ticket).
- If intent=INFO: clarify what they need and provide concise info.
- If intent=GREETING: greet and ask what they are looking for.

Return only the message to send to the user. No JSON.
`;

  const messages = [
    { role: "system", content: sys },
    // include last messages for context
    ...history,
    { role: "user", content: text || "" },
  ];

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.7,
    messages,
  });

  return resp.choices?.[0]?.message?.content?.trim() || "¡Listo! ¿En qué te puedo ayudar?";
}

/* ----------------------------- VOICE NOTES ----------------------------- */

async function transcribeAudioFromUrl(audioUrl) {
  // Minimal: download the file and send to OpenAI transcription.
  // Works best if audioUrl is publicly accessible.
  const res = await fetch(audioUrl);
  if (!res.ok) throw new Error(`Failed to download audio: ${res.status}`);

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // OpenAI SDK for Node accepts file-like (Blob) in many runtimes;
  // We'll wrap as a Blob (Node 18+ has Blob).
  const blob = new Blob([buffer]);

  const transcription = await openai.audio.transcriptions.create({
    model: "gpt-4o-mini-transcribe",
    file: blob,
  });

  const text = (transcription.text || "").trim();
  return text || null;
}

/* ----------------------------- FOLLOW-UP ENGINE ----------------------------- */

async function scheduleFollowUp({ organization_id, lead_phone, conversation_id, minutesFromNow, reason, payload }) {
  const dueAt = new Date(Date.now() + minutesFromNow * 60_000);
  await pool.query(
    `
    INSERT INTO followups (organization_id, lead_phone, conversation_id, due_at, reason, payload)
    VALUES ($1,$2,$3,$4,$5,$6)
    `,
    [organization_id, lead_phone, conversation_id, dueAt, reason || null, payload ? JSON.stringify(payload) : null]
  );
}

// A "follow-up runner" that marks followups due as SENT.
// (Sending to WhatsApp/SMS/email comes later; for now we just prepare the follow-up message content.)
async function runFollowUpTick() {
  const due = await pool.query(
    `
    SELECT f.*, o.name as org_name
    FROM followups f
    JOIN organizations o ON o.id=f.organization_id
    WHERE f.status='PENDING' AND f.due_at <= NOW()
    ORDER BY f.due_at ASC
    LIMIT 25
    `
  );

  for (const fu of due.rows) {
    // Build a gentle follow-up message (generic)
    const followText =
      fu.payload?.suggested_message ||
      "Hola 🙂 solo te doy seguimiento para ayudarte. ¿Seguís interesado/a o querés que te recomiende la mejor opción según tu caso?";

    // Store as system message so Base44 panel can show "queued/sent follow-up"
    await pool.query(
      `
      INSERT INTO messages (organization_id, conversation_id, role, content, meta)
      VALUES ($1,$2,$3,$4,$5)
      `,
      [fu.organization_id, fu.conversation_id, "system", followText, JSON.stringify({ type: "FOLLOW_UP", followup_id: fu.id })]
    );

    await pool.query(`UPDATE followups SET status='SENT', updated_at=NOW() WHERE id=$1`, [fu.id]);
  }
}

// Run every minute
setInterval(() => {
  runFollowUpTick().catch(() => {});
}, 60_000);

/* ----------------------------- API: HEALTH ----------------------------- */

app.get("/", (req, res) => {
  res.json({
    status: "EVA Core running 🚀",
    version: "4.0",
    time: nowISO(),
  });
});

/* ----------------------------- API: ADMIN ----------------------------- */

function requireAdmin(req, res, next) {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) return next(); // If not set, allow (dev mode)
  const got = req.headers["x-admin-key"];
  if (!got || got !== adminKey) return res.status(403).json({ error: "Forbidden" });
  next();
}

app.post("/v1/admin/orgs", requireAdmin, async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: "Missing name" });

    const apiKey = makeApiKey();
    const r = await pool.query(
      `
      INSERT INTO organizations (name, api_key)
      VALUES ($1,$2)
      RETURNING *
      `,
      [name, apiKey]
    );

    res.json({ organization: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "org creation failed" });
  }
});

/* ----------------------------- API: READ LAYER (for Base44) ----------------------------- */

app.get("/v1/leads", async (req, res) => {
  try {
    const apiKey = req.headers.authorization?.replace("Bearer ", "");
    if (!apiKey) return res.status(401).json({ error: "Missing Authorization Bearer" });

    const org = await getOrgByApiKey(apiKey);
    if (!org) return res.status(401).json({ error: "Invalid API Key" });

    const leads = await pool.query(
      `SELECT * FROM leads WHERE organization_id=$1 ORDER BY updated_at DESC NULLS LAST, created_at DESC`,
      [org.id]
    );

    res.json({ leads: leads.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed" });
  }
});

app.get("/v1/conversations", async (req, res) => {
  try {

    const api_key = req.query.api_key;

    if (!api_key) {
      return res.status(401).json({ error: "Missing API key" });
    }

    const org = await getOrgByApiKey(api_key);
    if (!org) {
      return res.status(401).json({ error: "Unauthorized - Invalid API Key" });
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

app.get("/v1/conversations/:id/messages", async (req, res) => {
  try {
    const apiKey = req.headers.authorization?.replace("Bearer ", "");
    if (!apiKey) return res.status(401).json({ error: "Missing Authorization Bearer" });

    const org = await getOrgByApiKey(apiKey);
    if (!org) return res.status(401).json({ error: "Invalid API Key" });

    const { id } = req.params;

    const msgs = await pool.query(
      `SELECT * FROM messages WHERE organization_id=$1 AND conversation_id=$2 ORDER BY created_at ASC LIMIT 200`,
      [org.id, id]
    );

    res.json({ messages: msgs.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed" });
  }
});

app.get("/v1/metrics/summary", async (req, res) => {
  try {
    const apiKey = req.headers.authorization?.replace("Bearer ", "");
    if (!apiKey) return res.status(401).json({ error: "Missing Authorization Bearer" });

    const org = await getOrgByApiKey(apiKey);
    if (!org) return res.status(401).json({ error: "Invalid API Key" });

    const period = getPeriodYYYYMM();

    const usage = await pool.query(`SELECT * FROM eva_usage WHERE organization_id=$1 AND period=$2`, [org.id, period]);
    const leadCount = await pool.query(`SELECT COUNT(*)::int as n FROM leads WHERE organization_id=$1`, [org.id]);
    const convCount = await pool.query(`SELECT COUNT(*)::int as n FROM conversations WHERE organization_id=$1`, [org.id]);

    res.json({
      period,
      leads: { total: leadCount.rows[0]?.n || 0 },
      conversations: { total: convCount.rows[0]?.n || 0 },
      usage: usage.rows[0] || { inbound_messages_count: 0, ai_responses_count: 0 },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed" });
  }
});

/* ----------------------------- API: BOOKINGS ----------------------------- */

app.post("/v1/bookings/request", async (req, res) => {
  try {
    const { api_key, external_user_id, conversation_id, requested_date, requested_time, notes } = req.body || {};
    if (!api_key || !external_user_id) return res.status(400).json({ error: "Missing api_key/external_user_id" });

    const org = await getOrgByApiKey(api_key);
    if (!org) return res.status(401).json({ error: "Invalid API Key" });

    const phone = normalizePhone(external_user_id);

    // Ensure lead exists
    await pool.query(
      `
      INSERT INTO leads (organization_id, phone, source, last_contact_at)
      VALUES ($1,$2,$3,NOW())
      ON CONFLICT (organization_id, phone)
      DO UPDATE SET last_contact_at=NOW(), updated_at=NOW()
      `,
      [org.id, phone, "booking"]
    );

    await pool.query(
      `
      INSERT INTO appointments (organization_id, lead_phone, conversation_id, requested_date, requested_time, notes)
      VALUES ($1,$2,$3,$4,$5,$6)
      `,
      [org.id, phone, conversation_id || null, requested_date || null, requested_time || null, notes || null]
    );

    res.json({ ok: true, status: "REQUESTED" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed" });
  }
});

/* ----------------------------- API: MAIN INBOUND (TEXT + VOICE) ----------------------------- */

app.post("/v1/messages/inbound", async (req, res) => {
  try {
    const { api_key, external_user_id, text, channel, audio_url, meta } = req.body || {};

    if (!api_key || !external_user_id || (!text && !audio_url)) {
      return res.status(400).json({ error: "Missing required fields: api_key, external_user_id, and text or audio_url" });
    }

    // rate limit per api_key
    if (!rateLimit(api_key, 120)) {
      return res.status(429).json({ error: "Rate limit exceeded" });
    }

    const org = await getOrgByApiKey(api_key);
    if (!org) return res.status(401).json({ error: "Unauthorized - Invalid API Key" });

    const phone = normalizePhone(external_user_id);
    const sourceChannel = channel || "unknown";

    // Usage: inbound count
    const period = getPeriodYYYYMM();
    await pool.query(
      `
      INSERT INTO eva_usage (organization_id, period, inbound_messages_count, ai_responses_count)
      VALUES ($1,$2,1,0)
      ON CONFLICT (organization_id, period)
      DO UPDATE SET inbound_messages_count = eva_usage.inbound_messages_count + 1, updated_at=NOW()
      `,
      [org.id, period]
    );

    // If voice note: transcribe to text
    let finalText = text ? String(text) : "";
    let voiceTranscript = null;

    if (!finalText && audio_url) {
      voiceTranscript = await transcribeAudioFromUrl(audio_url);
      finalText = voiceTranscript || "";
      if (!finalText) return res.status(400).json({ error: "Could not transcribe audio" });
    }

    // Ensure lead exists
    await pool.query(
      `
      INSERT INTO leads (organization_id, phone, source, last_contact_at)
      VALUES ($1,$2,$3,NOW())
      ON CONFLICT (organization_id, phone)
      DO UPDATE SET last_contact_at=NOW(), updated_at=NOW()
      `,
      [org.id, phone, sourceChannel]
    );

    // Ensure conversation exists
    let conv = await pool.query(
      `SELECT * FROM conversations WHERE organization_id=$1 AND external_user_id=$2`,
      [org.id, phone]
    );

    if (conv.rows.length === 0) {
      conv = await pool.query(
        `
        INSERT INTO conversations (organization_id, external_user_id, channel, updated_at)
        VALUES ($1,$2,$3,NOW())
        RETURNING *
        `,
        [org.id, phone, sourceChannel]
      );
    } else {
      await pool.query(`UPDATE conversations SET updated_at=NOW() WHERE id=$1`, [conv.rows[0].id]);
    }

    const conversationId = conv.rows[0].id;

    // Store user message
    await pool.query(
      `
      INSERT INTO messages (organization_id, conversation_id, role, content, meta)
      VALUES ($1,$2,$3,$4,$5)
      `,
      [
        org.id,
        conversationId,
        "user",
        finalText,
        JSON.stringify({
          channel: sourceChannel,
          audio_url: audio_url || null,
          transcript: voiceTranscript || null,
          meta: meta || null,
        }),
      ]
    );

    // Intent detection
    const useLLM = process.env.USE_LLM_INTENT === "true";
    const intent = useLLM ? await llmIntent(finalText) : heuristicIntent(finalText);

    // Extract + Score
    const budget = extractBudget(finalText);
    const useCase = extractUseCase(finalText);
    const score = computeLeadScore({ intent, budget, useCase, text: finalText });
    const interest_level = interestLevelFromScore(score);

    // Auto pipeline stage
    const leadRow = await pool.query(
      `SELECT stage FROM leads WHERE organization_id=$1 AND phone=$2`,
      [org.id, phone]
    );

    const prevStage = leadRow.rows[0]?.stage || "NEW";
    const nextStage = stageFromIntentAndScore(intent, score);

    // Update lead
    await pool.query(
      `
      UPDATE leads
      SET intent=$1,
          score=$2,
          interest_level=$3,
          budget=COALESCE($4,budget),
          use_case=COALESCE($5,use_case),
          stage=$6,
          updated_at=NOW()
      WHERE organization_id=$7 AND phone=$8
      `,
      [intent, score, interest_level, budget, useCase, nextStage, org.id, phone]
    );

    // If stage changed: log pipeline event
    if (prevStage !== nextStage) {
      await pool.query(
        `
        INSERT INTO pipeline_events (organization_id, lead_phone, from_stage, to_stage, reason)
        VALUES ($1,$2,$3,$4,$5)
        `,
        [org.id, phone, prevStage, nextStage, `Auto by intent=${intent}, score=${score}`]
      );
    }

    // Fetch last 10 messages for AI context
    const hist = await pool.query(
      `
      SELECT role, content
      FROM messages
      WHERE organization_id=$1 AND conversation_id=$2
      ORDER BY created_at DESC
      LIMIT 10
      `,
      [org.id, conversationId]
    );

    // reverse to chronological
    const history = hist.rows
      .reverse()
      .map((m) => ({ role: m.role === "assistant" ? "assistant" : m.role === "user" ? "user" : "assistant", content: m.content }));

    // Generate AI reply
    const aiReply = await buildAIReply({
      orgName: org.name,
      intent,
      text: finalText,
      history,
    });

    // Usage: ai response count
    await pool.query(
      `
      UPDATE eva_usage
      SET ai_responses_count = ai_responses_count + 1,
          updated_at=NOW()
      WHERE organization_id=$1 AND period=$2
      `,
      [org.id, period]
    );

    // Store assistant reply
    await pool.query(
      `
      INSERT INTO messages (organization_id, conversation_id, role, content, meta)
      VALUES ($1,$2,$3,$4,$5)
      `,
      [org.id, conversationId, "assistant", aiReply, JSON.stringify({ intent, score, interest_level })]
    );

    // Follow-up scheduling (simple rules)
    // - If BUY or BOOKING and they don't answer later, follow up in 24h.
    // - If INFO, follow up in 48h.
    if (intent === "BUY" || intent === "BOOKING") {
      await scheduleFollowUp({
        organization_id: org.id,
        lead_phone: phone,
        conversation_id: conversationId,
        minutesFromNow: 24 * 60,
        reason: `Auto follow-up for intent=${intent}`,
        payload: { suggested_message: "Hola 🙂 ¿querés que te ayude a avanzar con esto? Me decís para qué lo necesitás y tu presupuesto aproximado y te recomiendo la mejor opción." },
      });
    } else if (intent === "INFO") {
      await scheduleFollowUp({
        organization_id: org.id,
        lead_phone: phone,
        conversation_id: conversationId,
        minutesFromNow: 48 * 60,
        reason: "Auto follow-up for INFO",
        payload: { suggested_message: "Hola 👋 solo te doy seguimiento. ¿Pudiste ver la info? Si me contás tu caso, te guío con la mejor recomendación." },
      });
    }

    // If booking intent: create booking request skeleton (optional)
    if (intent === "BOOKING") {
      await pool.query(
        `
        INSERT INTO appointments (organization_id, lead_phone, conversation_id, notes)
        VALUES ($1,$2,$3,$4)
        `,
        [org.id, phone, conversationId, "Auto-created from BOOKING intent. Pending user date/time."]
      );
    }

    res.json({
      reply: aiReply,
      intent,
      score,
      interest_level,
      stage: nextStage,
      extracted: {
        budget,
        use_case: useCase,
        transcript: voiceTranscript || null,
      },
      conversation_id: conversationId,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "EVA failed" });
  }
});

/* ----------------------------- STARTUP ----------------------------- */

(async () => {
  try {
    await ensureSchema();
app.get("/v1/conversations", async (req, res) => {
  try {
    const api_key = req.query.api_key;

    if (!api_key) {
      return res.status(401).json({ error: "Missing API key" });
    }

    const org = await getOrgByApiKey(api_key);
    if (!org) {
      return res.status(401).json({ error: "Unauthorized - Invalid API Key" });
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
    app.listen(PORT, () => {
      console.log(`EVA running on port ${PORT}`);
    });
  } catch (e) {
    console.error("Startup failed:", e);
    process.exit(1);
  }
})();

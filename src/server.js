import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import pool from "./db.js";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* ===============================
   HELPERS
================================ */

function makeApiKey(prefix = "eva") {
  const token = crypto.randomBytes(24).toString("hex");
  return `${prefix}_${token}`;
}

function requireAdmin(req, res, next) {
  const adminKey = req.headers["x-admin-key"];
  if (!process.env.ADMIN_API_KEY) {
    return res.status(500).json({ error: "ADMIN_API_KEY not set" });
  }
  if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: "Unauthorized (admin)" });
  }
  next();
}

function currentPeriodYYYYMM() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/* ===============================
   DATABASE INIT
================================ */
(async () => {
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

    // Organizations = SaaS tenants (each gets an API key)
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

    // Leads scoped by organization
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
        created_at TIMESTAMP DEFAULT NOW()
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

    // Usage tracking (monthly)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS eva_usage (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id),
        period TEXT NOT NULL, -- YYYY-MM
        inbound_messages_count INTEGER DEFAULT 0,
        ai_responses_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (organization_id, period)
      );
    `);

    console.log("DB connected and tables ready ✅");
  } catch (err) {
    console.error("DB connection error:", err);
  }
})();

/* ===============================
   HEALTH CHECK
================================ */
app.get("/", (req, res) => {
  res.json({
    status: "EVA Core running 🚀",
    version: "2.1.0",
  });
});

/* ===============================
   ADMIN SaaS MODULE
   (Create clients, list, rotate API keys, metrics)
================================ */

/**
 * Create organization (tenant) + API key
 * Admin only
 */
app.post("/v1/admin/orgs", requireAdmin, async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ error: "name is required" });
    }

    const apiKey = makeApiKey("eva");
    const result = await pool.query(
      `
      INSERT INTO organizations (name, api_key)
      VALUES ($1, $2)
      RETURNING id, name, api_key, status, created_at
      `,
      [String(name).trim(), apiKey]
    );

    return res.json({ organization: result.rows[0] });
  } catch (error) {
    console.error("ADMIN create org error:", error);
    return res.status(500).json({ error: "Failed to create organization" });
  }
});

/**
 * List organizations
 * Admin only
 */
app.get("/v1/admin/orgs", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, name, api_key, status, created_at, updated_at
      FROM organizations
      ORDER BY created_at DESC
      LIMIT 200
      `
    );
    return res.json({ organizations: result.rows });
  } catch (error) {
    console.error("ADMIN list orgs error:", error);
    return res.status(500).json({ error: "Failed to list organizations" });
  }
});

/**
 * Rotate API key for an org
 * Admin only
 */
app.post("/v1/admin/orgs/:org_id/rotate-key", requireAdmin, async (req, res) => {
  try {
    const { org_id } = req.params;
    const newKey = makeApiKey("eva");

    const updated = await pool.query(
      `
      UPDATE organizations
      SET api_key=$1, updated_at=NOW()
      WHERE id=$2
      RETURNING id, name, api_key, status, updated_at
      `,
      [newKey, org_id]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: "Organization not found" });
    }

    return res.json({ organization: updated.rows[0] });
  } catch (error) {
    console.error("ADMIN rotate key error:", error);
    return res.status(500).json({ error: "Failed to rotate key" });
  }
});

/**
 * Admin metrics overview (all orgs)
 */
app.get("/v1/admin/metrics/summary", requireAdmin, async (req, res) => {
  try {
    const period = currentPeriodYYYYMM();

    const orgs = await pool.query(`SELECT id, name, status FROM organizations ORDER BY created_at DESC LIMIT 200`);

    const usage = await pool.query(
      `
      SELECT organization_id, period, inbound_messages_count, ai_responses_count
      FROM eva_usage
      WHERE period=$1
      `,
      [period]
    );

    const usageMap = new Map();
    for (const u of usage.rows) usageMap.set(u.organization_id, u);

    const rows = orgs.rows.map((o) => {
      const u = usageMap.get(o.id) || { inbound_messages_count: 0, ai_responses_count: 0 };
      return {
        organization_id: o.id,
        name: o.name,
        status: o.status,
        period,
        inbound_messages: u.inbound_messages_count,
        ai_responses: u.ai_responses_count,
      };
    });

    return res.json({ period, organizations: rows });
  } catch (error) {
    console.error("ADMIN metrics error:", error);
    return res.status(500).json({ error: "Failed to load admin metrics" });
  }
});

/* ===============================
   CLIENT AUTH (API Key per org)
================================ */
async function getOrgByApiKey(api_key) {
  const orgQuery = await pool.query(
    "SELECT id, name, api_key, status FROM organizations WHERE api_key=$1 LIMIT 1",
    [api_key]
  );
  if (orgQuery.rows.length === 0) return null;
  if (orgQuery.rows[0].status !== "ACTIVE") return null;
  return orgQuery.rows[0];
}

/* ===============================
   TEST ENDPOINT (NO AUTH)
================================ */
app.get("/test", async (req, res) => {
  try {
    const text = req.query.msg || "hola";

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are EVA, an intelligent AI sales assistant.

Your goal:
Convert conversations into sales.

Rules:
- Keep responses short
- Ask helpful questions
- Guide the customer toward a purchase
- Speak naturally like a human sales advisor
`,
        },
        { role: "user", content: String(text) },
      ],
      temperature: 0.7,
    });

    res.json({
      question: text,
      reply: response.choices?.[0]?.message?.content || "",
    });
  } catch (error) {
    console.error(error);
    res.json({ error: "EVA test failed" });
  }
});

/* ===============================
   PANEL-FRIENDLY ENDPOINTS (per org)
   These endpoints are used by your future Base44 dashboard.
================================ */

/**
 * List leads (for a tenant)
 */
app.get("/v1/leads", async (req, res) => {
  try {
    const api_key = req.headers.authorization?.replace("Bearer ", "") || req.query.api_key;
    if (!api_key) return res.status(401).json({ error: "Missing api_key" });

    const org = await getOrgByApiKey(api_key);
    if (!org) return res.status(401).json({ error: "Unauthorized - Invalid API Key" });

    const result = await pool.query(
      `
      SELECT id, phone, email, source, status, stage, budget, use_case, intent, score, created_at, updated_at
      FROM leads
      WHERE organization_id=$1
      ORDER BY updated_at DESC
      LIMIT 200
      `,
      [org.id]
    );

    res.json({ organization: { id: org.id, name: org.name }, leads: result.rows });
  } catch (error) {
    console.error("List leads error:", error);
    res.status(500).json({ error: "Failed to list leads" });
  }
});

/**
 * List conversations (for a tenant)
 */
app.get("/v1/conversations", async (req, res) => {
  try {
    const api_key = req.headers.authorization?.replace("Bearer ", "") || req.query.api_key;
    if (!api_key) return res.status(401).json({ error: "Missing api_key" });

    const org = await getOrgByApiKey(api_key);
    if (!org) return res.status(401).json({ error: "Unauthorized - Invalid API Key" });

    const result = await pool.query(
      `
      SELECT id, external_user_id, channel, stage, summary, created_at, updated_at
      FROM conversations
      WHERE organization_id=$1
      ORDER BY updated_at DESC
      LIMIT 200
      `,
      [org.id]
    );

    res.json({ organization: { id: org.id, name: org.name }, conversations: result.rows });
  } catch (error) {
    console.error("List conversations error:", error);
    res.status(500).json({ error: "Failed to list conversations" });
  }
});

/**
 * Get messages for a conversation (for a tenant)
 */
app.get("/v1/conversations/:conversation_id/messages", async (req, res) => {
  try {
    const api_key = req.headers.authorization?.replace("Bearer ", "") || req.query.api_key;
    if (!api_key) return res.status(401).json({ error: "Missing api_key" });

    const org = await getOrgByApiKey(api_key);
    if (!org) return res.status(401).json({ error: "Unauthorized - Invalid API Key" });

    const { conversation_id } = req.params;

    // Ensure conversation belongs to org
    const conv = await pool.query(
      `SELECT id FROM conversations WHERE id=$1 AND organization_id=$2 LIMIT 1`,
      [conversation_id, org.id]
    );
    if (conv.rows.length === 0) return res.status(404).json({ error: "Conversation not found" });

    const result = await pool.query(
      `
      SELECT id, role, content, created_at
      FROM messages
      WHERE conversation_id=$1 AND organization_id=$2
      ORDER BY created_at ASC
      LIMIT 200
      `,
      [conversation_id, org.id]
    );

    res.json({ conversation_id, messages: result.rows });
  } catch (error) {
    console.error("Conversation messages error:", error);
    res.status(500).json({ error: "Failed to load messages" });
  }
});

/**
 * Tenant metrics summary (usage + leads)
 */
app.get("/v1/metrics/summary", async (req, res) => {
  try {
    const api_key = req.headers.authorization?.replace("Bearer ", "") || req.query.api_key;
    if (!api_key) return res.status(401).json({ error: "Missing api_key" });

    const org = await getOrgByApiKey(api_key);
    if (!org) return res.status(401).json({ error: "Unauthorized - Invalid API Key" });

    const period = req.query.period || currentPeriodYYYYMM();

    const usage = await pool.query(
      `
      SELECT inbound_messages_count, ai_responses_count
      FROM eva_usage
      WHERE organization_id=$1 AND period=$2
      LIMIT 1
      `,
      [org.id, period]
    );

    const leadsAgg = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN stage='NEW' THEN 1 ELSE 0 END)::int AS new_count,
        SUM(CASE WHEN stage='CONTACTED' THEN 1 ELSE 0 END)::int AS contacted_count,
        SUM(CASE WHEN stage='QUALIFIED' THEN 1 ELSE 0 END)::int AS qualified_count,
        SUM(CASE WHEN stage='PROPOSAL' THEN 1 ELSE 0 END)::int AS proposal_count,
        SUM(CASE WHEN stage='CLOSED' THEN 1 ELSE 0 END)::int AS closed_count
      FROM leads
      WHERE organization_id=$1
      `,
      [org.id]
    );

    const u = usage.rows[0] || { inbound_messages_count: 0, ai_responses_count: 0 };

    res.json({
      organization: { id: org.id, name: org.name },
      period,
      usage: u,
      leads: leadsAgg.rows[0],
    });
  } catch (error) {
    console.error("Tenant metrics error:", error);
    res.status(500).json({ error: "Failed to load metrics" });
  }
});

/* ===============================
   INBOUND MESSAGE (MAIN)
   Multi-tenant via api_key per customer
================================ */
app.post("/v1/messages/inbound", async (req, res) => {
  try {
    const { api_key, external_user_id, text, channel } = req.body;

    if (!api_key || !external_user_id || !text) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Tenant auth
    const org = await getOrgByApiKey(api_key);
    if (!org) {
      return res.status(401).json({ error: "Unauthorized - Invalid API Key" });
    }
    const organization_id = org.id;

    const leadPhone = String(external_user_id);
    const leadSource = channel || "unknown";
    const msgLower = String(text).toLowerCase();

    // Ensure usage row exists and increment inbound
    const period = currentPeriodYYYYMM();
    await pool.query(
      `
      INSERT INTO eva_usage (organization_id, period, inbound_messages_count, ai_responses_count)
      VALUES ($1,$2,0,0)
      ON CONFLICT (organization_id, period) DO NOTHING
      `,
      [organization_id, period]
    );
    await pool.query(
      `
      UPDATE eva_usage
      SET inbound_messages_count = inbound_messages_count + 1,
          updated_at = NOW()
      WHERE organization_id=$1 AND period=$2
      `,
      [organization_id, period]
    );

    /* ===============================
       CREATE LEAD IF NOT EXISTS
    ============================== */
    await pool.query(
      `
      INSERT INTO leads (organization_id, phone, source)
      VALUES ($1,$2,$3)
      ON CONFLICT (organization_id, phone) DO NOTHING
      `,
      [organization_id, leadPhone, leadSource]
    );

    /* ===============================
       FIND OR CREATE CONVERSATION
    ============================== */
    let conversation = await pool.query(
      `
      SELECT * FROM conversations
      WHERE organization_id=$1 AND external_user_id=$2
      LIMIT 1
      `,
      [organization_id, leadPhone]
    );

    if (conversation.rows.length === 0) {
      conversation = await pool.query(
        `
        INSERT INTO conversations (organization_id, external_user_id, channel)
        VALUES ($1,$2,$3)
        RETURNING *
        `,
        [organization_id, leadPhone, leadSource]
      );
    }

    const conversation_id = conversation.rows[0].id;

    /* ===============================
       SAVE USER MESSAGE
    ============================== */
    await pool.query(
      `INSERT INTO messages (organization_id, conversation_id, role, content)
       VALUES ($1,$2,$3,$4)`,
      [organization_id, conversation_id, "user", String(text)]
    );

    /* ===============================
       LOAD HISTORY (last 10)
    ============================== */
    const history = await pool.query(
      `
      SELECT role, content
      FROM messages
      WHERE organization_id=$1 AND conversation_id=$2
      ORDER BY created_at ASC
      LIMIT 10
      `,
      [organization_id, conversation_id]
    );

    /* ===============================
       IMPROVEMENT #1: Better system prompt (sales)
    ============================== */
    const systemPrompt = `
You are EVA, an AI sales assistant.

Behavior:
- Sound natural, helpful, and confident.
- Keep answers short (1–3 sentences).
- Ask 1 clear question when needed.
- Move the conversation toward the next step (photos, options, reservation, visit).

Sales logic:
- If the user asks price/availability → confirm availability if known and propose next step.
- If user is exploring → ask use case + budget.
- Never invent inventory or discounts.
`;

    /* ===============================
       AI RESPONSE
    ============================== */
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }, ...history.rows, { role: "user", content: String(text) }],
      temperature: 0.7,
    });

    const reply = ai.choices?.[0]?.message?.content || "";

    // Increment AI responses usage (counts as 1 credit)
    await pool.query(
      `
      UPDATE eva_usage
      SET ai_responses_count = ai_responses_count + 1,
          updated_at = NOW()
      WHERE organization_id=$1 AND period=$2
      `,
      [organization_id, period]
    );

    /* ===============================
       IMPROVEMENT #2: Data extraction (budget/use_case)
    ============================== */
    let detectedBudget = null;
    let detectedUseCase = null;

    // budget: grab a number like 70, 135000, 200000 (we keep as text for now)
    const budgetMatch = msgLower.match(/\b(\d{2,6})\b/);
    if (budgetMatch) detectedBudget = budgetMatch[1];

    if (msgLower.includes("estudio") || msgLower.includes("colegio") || msgLower.includes("escuela") || msgLower.includes("universidad")) {
      detectedUseCase = "STUDY";
    } else if (msgLower.includes("trabajo") || msgLower.includes("oficina") || msgLower.includes("empresa") || msgLower.includes("excel")) {
      detectedUseCase = "WORK";
    } else if (msgLower.includes("gaming") || msgLower.includes("juegos") || msgLower.includes("gamer")) {
      detectedUseCase = "GAMING";
    }

    /* ===============================
       IMPROVEMENT #3: Smarter intent + scoring
    ============================== */
    let intent = "INFO";
    let score = 30;

    const isBuy =
      msgLower.includes("precio") ||
      msgLower.includes("cuesta") ||
      msgLower.includes("vale") ||
      msgLower.includes("disponible") ||
      msgLower.includes("comprar") ||
      msgLower.includes("apartar") ||
      msgLower.includes("apartarlo") ||
      msgLower.includes("sinpe") ||
      msgLower.includes("pago");

    const isGreeting =
      msgLower.includes("hola") ||
      msgLower.includes("buenas") ||
      msgLower.includes("buenos") ||
      msgLower.includes("buenas tardes") ||
      msgLower.includes("buenos días");

    const isSupport =
      msgLower.includes("problema") ||
      msgLower.includes("no funciona") ||
      msgLower.includes("reparar") ||
      msgLower.includes("arreglar") ||
      msgLower.includes("diagnóstico") ||
      msgLower.includes("diagnostico");

    if (isBuy) {
      intent = "BUY";
      score = 80;
    } else if (isGreeting) {
      intent = "GREETING";
      score = 10;
    } else if (isSupport) {
      intent = "SUPPORT";
      score = 25;
    }

    if (detectedBudget) score += 10;
    if (detectedUseCase) score += 10;

    score = clamp(score, 0, 100);

    /* ===============================
       IMPROVEMENT #4: Pipeline stage auto
    ============================== */
    const leadRow = await pool.query(
      `SELECT stage FROM leads WHERE organization_id=$1 AND phone=$2 LIMIT 1`,
      [organization_id, leadPhone]
    );

    const currentStage = leadRow.rows[0]?.stage || "NEW";
    let newStage = currentStage;
    let reason = null;

    if (currentStage === "NEW") {
      newStage = "CONTACTED";
      reason = "first_message";
    }

    if (intent === "BUY" && (currentStage === "NEW" || currentStage === "CONTACTED")) {
      newStage = "QUALIFIED";
      reason = "buy_intent";
    }

    if (isBuy && (msgLower.includes("precio") || msgLower.includes("apart") || msgLower.includes("pago") || msgLower.includes("sinpe"))) {
      newStage = "PROPOSAL";
      reason = "price_or_reserve";
    }

    /* ===============================
       Save lead updates
    ============================== */
    await pool.query(
      `
      UPDATE leads
      SET intent=$1,
          score=$2,
          stage=$3,
          budget=COALESCE($4,budget),
          use_case=COALESCE($5,use_case),
          updated_at=NOW()
      WHERE organization_id=$6 AND phone=$7
      `,
      [intent, score, newStage, detectedBudget, detectedUseCase, organization_id, leadPhone]
    );

    if (newStage !== currentStage) {
      await pool.query(
        `
        INSERT INTO pipeline_events (organization_id, lead_phone, from_stage, to_stage, reason)
        VALUES ($1,$2,$3,$4,$5)
        `,
        [organization_id, leadPhone, currentStage, newStage, reason]
      );
    }

    /* ===============================
       SAVE EVA RESPONSE
    ============================== */
    await pool.query(
      `INSERT INTO messages (organization_id, conversation_id, role, content)
       VALUES ($1,$2,$3,$4)`,
      [organization_id, conversation_id, "assistant", reply]
    );

    /* ===============================
       IMPROVEMENT #5: Follow-up suggestion
    ============================== */
    let followUp = null;
    if (intent === "BUY") followUp = "Offer next step: photos + reservation";
    if (intent === "INFO") followUp = "Ask for budget + use case";
    if (intent === "GREETING") followUp = "Ask what they are looking for";
    if (intent === "SUPPORT") followUp = "Ask device type + issue details";

    return res.json({
      organization: { id: org.id, name: org.name },
      conversation_id,
      reply,
      intent,
      score,
      stage: newStage,
      stage_prev: currentStage,
      stage_reason: reason,
      follow_up: followUp,
      extracted: {
        budget: detectedBudget,
        use_case: detectedUseCase,
      },
      ai_stage: "AI_ACTIVE",
      confidence: 0.95,
    });
  } catch (error) {
    console.error("EVA Error:", error);
    return res.status(500).json({ error: "EVA failed to respond", stage: "ERROR" });
  }
});

/* ===============================
   SERVER START
================================ */
app.listen(PORT, () => {
  console.log(`EVA Core running on port ${PORT}`);
});

// server.js (EVA Core v8 — FIXED Multi-Channel Conversations)

import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import pkg from "pg";
import crypto from "crypto";

import { registerLeadRoutes } from "./api/leads.js";
import { registerMetricsRoutes } from "./api/metrics.js";
import { registerIntelRoutes } from "./api/intel.js";
import { registerConversationRoutes } from "./api/conversations.js";

import { handleInbound } from "./salesBrain.js";

dotenv.config();

const { Pool } = pkg;

const app = express();
app.use(express.json({ limit: "5mb" }));

const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_SSL === "true"
      ? { rejectUnauthorized: false }
      : false
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function normalizePhone(id) {
  return String(id || "").trim();
}

function makeApiKey() {
  return "eva_" + crypto.randomBytes(20).toString("hex");
}

function getBearerToken(req) {
  const header = req.headers.authorization;

  if (!header) return null;

  if (header.startsWith("Bearer ")) {
    return header.replace("Bearer ", "");
  }

  return header;
}

/* ----------------------------- ORG AUTH ----------------------------- */

async function getOrgByApiKey(apiKey) {
  const r = await pool.query(
    `SELECT *
     FROM organizations
     WHERE api_key=$1 AND status='ACTIVE'`,
    [apiKey]
  );

  return r.rows[0] || null;
}

/* ----------------------------- DEFAULT AGENT ----------------------------- */

async function getDefaultAgent(orgId) {
  try {
    const r = await pool.query(
      `SELECT id
       FROM agents
       WHERE organization_id=$1
       ORDER BY created_at ASC
       LIMIT 1`,
      [orgId]
    );

    return r.rows[0]?.id || null;
  } catch {
    return null;
  }
}

/* ----------------------------- HEALTH ----------------------------- */

app.get("/", (req, res) => {
  res.json({
    status: "EVA Core running 🚀",
    version: "8.1"
  });
});

/* ----------------------------- OUTBOUND ----------------------------- */

app.post("/v1/messages/outbound", async (req, res) => {
  try {

    const { api_key, external_user_id, text, channel } = req.body;

    if (!api_key || !external_user_id || !text) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const org = await getOrgByApiKey(api_key);
    if (!org) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    const phone = normalizePhone(external_user_id);
    const ch = channel || "unknown";

    const conv = await pool.query(
      `SELECT *
       FROM conversations
       WHERE organization_id=$1
       AND external_user_id=$2
       AND channel=$3
       LIMIT 1`,
      [org.id, phone, ch]
    );

    let conversationId;
    let agentId = null;

    if (conv.rows.length === 0) {

      agentId = await getDefaultAgent(org.id);

      const newConv = await pool.query(
        `INSERT INTO conversations
        (organization_id, agent_id, external_user_id, channel)
        VALUES ($1,$2,$3,$4)
        RETURNING *`,
        [org.id, agentId, phone, ch]
      );

      conversationId = newConv.rows[0].id;

    } else {

      conversationId = conv.rows[0].id;

    }

    await pool.query(
      `INSERT INTO messages
      (organization_id, conversation_id, role, content)
      VALUES ($1,$2,$3,$4)`,
      [org.id, conversationId, "assistant", text]
    );

    res.json({
      ok: true,
      conversation_id: conversationId,
      sent: false,
      reply: text
    });

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: "Server error" });

  }
});

/* ----------------------------- INBOUND ----------------------------- */

app.post("/v1/messages/inbound", async (req, res) => {

  try {

    const { api_key, external_user_id, text, channel } = req.body;

    if (!api_key || !external_user_id || !text) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const org = await getOrgByApiKey(api_key);

    if (!org) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    const phone = normalizePhone(external_user_id);
    const ch = channel || "unknown";

    const conv = await pool.query(
      `SELECT *
       FROM conversations
       WHERE organization_id=$1
       AND external_user_id=$2
       AND channel=$3
       LIMIT 1`,
      [org.id, phone, ch]
    );

    let conversationId;
    let controlMode = "AI_ACTIVE";
    let agentId = null;

    if (conv.rows.length === 0) {

      agentId = await getDefaultAgent(org.id);

      const newConv = await pool.query(
        `INSERT INTO conversations
        (organization_id, agent_id, external_user_id, channel)
        VALUES ($1,$2,$3,$4)
        RETURNING *`,
        [org.id, agentId, phone, ch]
      );

      conversationId = newConv.rows[0].id;
      controlMode = newConv.rows[0].control_mode || "AI_ACTIVE";
      agentId = newConv.rows[0].agent_id || agentId;

    } else {

      conversationId = conv.rows[0].id;
      controlMode = conv.rows[0].control_mode || "AI_ACTIVE";
      agentId =
        conv.rows[0].agent_id || (await getDefaultAgent(org.id));

    }

    if (controlMode === "HUMAN_ACTIVE") {

      await pool.query(
        `INSERT INTO messages
        (organization_id, conversation_id, role, content)
        VALUES ($1,$2,$3,$4)`,
        [org.id, conversationId, "user", text]
      );

      return res.json({
        paused: true,
        reason: "Human takeover active",
        conversation_id: conversationId
      });

    }

    await pool.query(
      `INSERT INTO messages
      (organization_id, conversation_id, role, content)
      VALUES ($1,$2,$3,$4)`,
      [org.id, conversationId, "user", text]
    );

    let result = await handleInbound({
      pool,
      openai,
      org,
      agentId,
      conversationId,
      externalUserId: phone,
      text,
      channel: ch
    });

    if (!result || !result.reply) {

      result = {
        reply:
          "¡Hola! Estoy aquí para ayudarte. ¿Podrías contarme un poco más de lo que buscas?",
        intent: "UNKNOWN",
        confidence: 0.5,
        leadScore: 10,
        stage: "DISCOVERY",
        data: {}
      };

    }

    await pool.query(
      `INSERT INTO messages
      (organization_id, conversation_id, role, content)
      VALUES ($1,$2,$3,$4)`,
      [org.id, conversationId, "assistant", result.reply]
    );

    res.json({
      reply: result.reply,
      conversation_id: conversationId,
      intent: result.intent,
      confidence: result.confidence || 0.5,
      lead_score: result.leadScore || 0,
      stage: result.stage || "DISCOVERY",
      data: result.data || {},
      catalog_matches: result.catalogMatches || []
    });

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: "Server error" });

  }
});

/* ----------------------------- ROUTES ----------------------------- */

registerConversationRoutes(app, pool);
registerLeadRoutes(app, pool);
registerMetricsRoutes(app, pool);
registerIntelRoutes(app, pool);

app.listen(PORT, () => {
  console.log("EVA running on port", PORT);
});

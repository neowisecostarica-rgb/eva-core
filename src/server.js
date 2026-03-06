// server.js (EVA Core v8 — Confidence + Stage + CRM Data + Followups + Outbound)

import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import pkg from "pg";
import crypto from "crypto";
import { registerLeadRoutes } from "./api/leads.js";
import { registerMetricsRoutes } from "./api/metrics.js";

import { handleInbound } from "./salesBrain.js";
import { registerConversationRoutes } from "./api/conversations.js";

dotenv.config();

const { Pool } = pkg;

const app = express();
app.use(express.json({ limit: "5mb" }));

const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true"
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
  return req.headers.authorization?.replace("Bearer ", "") || null;
}

/* ----------------------------- ORG AUTH ----------------------------- */

async function getOrgByApiKey(apiKey) {
  const r = await pool.query(
    `SELECT * FROM organizations
     WHERE api_key=$1 AND status='ACTIVE'`,
    [apiKey]
  );
  return r.rows[0] || null;
}

/* ----------------------------- DEFAULT AGENT ----------------------------- */

async function getDefaultAgent(orgId) {
  try {
    const r = await pool.query(
      `SELECT id FROM agents
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
    version: "8.0"
  });
});

/* ----------------------------- OUTBOUND (GENÉRICO) ----------------------------- */
/* Guarda mensaje assistant en DB.
   Si luego quieres conectarlo a WhatsApp/IG directo desde aquí,
   este endpoint es la base. */

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
      `SELECT * FROM conversations
       WHERE organization_id=$1 AND external_user_id=$2
       LIMIT 1`,
      [org.id, phone]
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

    return res.json({
      ok: true,
      conversation_id: conversationId,
      sent: false, // guardado en DB; envío real lo hace otro conector si quieres
      reply: text
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ----------------------------- EVA INBOUND ----------------------------- */

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
      `SELECT * FROM conversations
       WHERE organization_id=$1 AND external_user_id=$2
       LIMIT 1`,
      [org.id, phone]
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
      agentId = conv.rows[0].agent_id || (await getDefaultAgent(org.id));
    }

    // HUMAN CONTROL
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

    // Guardar mensaje del usuario
    await pool.query(
      `INSERT INTO messages
       (organization_id, conversation_id, role, content)
       VALUES ($1,$2,$3,$4)`,
      [org.id, conversationId, "user", text]
    );

    // Sales Brain
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

    // Fallback seguro
    if (!result || !result.reply) {
      console.warn("EVA fallback triggered");
      result = {
        reply: "¡Hola! Estoy aquí para ayudarte. ¿Podrías contarme un poco más de lo que buscas?",
        intent: "UNKNOWN",
        confidence: 0.5,
        leadScore: 10,
        stage: "DISCOVERY",
        data: {}
      };
    }

    // Guardar respuesta assistant
    await pool.query(
      `INSERT INTO messages
       (organization_id, conversation_id, role, content)
       VALUES ($1,$2,$3,$4)`,
      [org.id, conversationId, "assistant", result.reply]
    );

    return res.json({
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

/* ----------------------------- HUMAN TAKEOVER ----------------------------- */

app.post("/v1/conversations/:id/takeover", async (req, res) => {
  try {
    const apiKey = getBearerToken(req);
    const org = await getOrgByApiKey(apiKey);

    if (!org) {
      return res.status(401).json({ error: "Invalid key" });
    }

    const { id } = req.params;

    await pool.query(
      `UPDATE conversations
       SET control_mode='HUMAN_ACTIVE'
       WHERE id=$1 AND organization_id=$2`,
      [id, org.id]
    );

    res.json({ status: "HUMAN_ACTIVE" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

/* ----------------------------- RETURN TO EVA ----------------------------- */

app.post("/v1/conversations/:id/ai", async (req, res) => {
  try {
    const apiKey = getBearerToken(req);
    const org = await getOrgByApiKey(apiKey);

    if (!org) {
      return res.status(401).json({ error: "Invalid key" });
    }

    const { id } = req.params;

    await pool.query(
      `UPDATE conversations
       SET control_mode='AI_ACTIVE'
       WHERE id=$1 AND organization_id=$2`,
      [id, org.id]
    );

    res.json({ status: "AI_ACTIVE" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

/* ----------------------------- FOLLOWUPS WORKER ----------------------------- */
/* Ejecuta followups pendientes.
   Ideal para llamarlo con cron cada 5-10 min. */

app.post("/v1/internal/run-followups", async (req, res) => {
  try {
    const tasks = await pool.query(
      `SELECT *
       FROM followups
       WHERE status='pending'
         AND scheduled_for <= now()
       ORDER BY scheduled_for ASC
       LIMIT 20`
    );

    let processed = 0;

    for (const f of tasks.rows) {
      try {
        const conv = await pool.query(
          `SELECT id, organization_id, external_user_id, channel
           FROM conversations
           WHERE id=$1
           LIMIT 1`,
          [f.conversation_id]
        );

        if (!conv.rows.length) {
          await pool.query(
            `UPDATE followups
             SET status='failed'
             WHERE id=$1`,
            [f.id]
          );
          continue;
        }

        const conversation = conv.rows[0];

        const orgR = await pool.query(
          `SELECT id, api_key
           FROM organizations
           WHERE id=$1
           LIMIT 1`,
          [conversation.organization_id]
        );

        if (!orgR.rows.length || !orgR.rows[0].api_key) {
          await pool.query(
            `UPDATE followups
             SET status='failed'
             WHERE id=$1`,
            [f.id]
          );
          continue;
        }

        const msg =
          "Hola 👋 Solo paso a confirmar si todavía seguís buscando información. Si querés, te ayudo con más detalles o con una opción ideal para vos.";

        await fetch(`${process.env.EVA_BASE_URL}/v1/messages/outbound`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: orgR.rows[0].api_key,
            external_user_id: conversation.external_user_id,
            text: msg,
            channel: conversation.channel || "unknown"
          })
        });

        await pool.query(
          `UPDATE followups
           SET status='sent'
           WHERE id=$1`,
          [f.id]
        );

        processed += 1;
      } catch (innerErr) {
        console.error("Followup item error:", innerErr);
        try {
          await pool.query(
            `UPDATE followups
             SET status='failed'
             WHERE id=$1`,
            [f.id]
          );
        } catch {}
      }
    }

    res.json({ processed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "worker error" });
  }
});

/* ----------------------------- WHATSAPP WEBHOOK ----------------------------- */

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
    const text = message.text?.body;

    if (!from || !text) {
      return res.sendStatus(200);
    }

    const response = await fetch(
      `${process.env.EVA_BASE_URL}/v1/messages/inbound`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: process.env.EVA_DEFAULT_API_KEY,
          external_user_id: from,
          text,
          channel: "whatsapp"
        })
      }
    );

    const eva = await response.json();

    if (!eva.reply) {
      return res.sendStatus(200);
    }

    await fetch(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: from,
          text: { body: eva.reply }
        })
      }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

/* ----------------------------- START ----------------------------- */

// activar API conversations
registerConversationRoutes(app, pool);
registerLeadRoutes(app, pool);
registerMetricsRoutes(app, pool);

app.listen(PORT, () => {
  console.log("EVA running on port", PORT);
});

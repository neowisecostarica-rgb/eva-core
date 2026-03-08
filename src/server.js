import express from "express";
import dotenv from "dotenv";

import { validateInbound } from "./validators.js";
import { handleInbound } from "./salesBrain.js";
import { startFollowupWorker } from "./followupWorker.js";

import pool from "./db.js";

dotenv.config();

const app = express();

app.use(express.json({ limit: "1mb" }));

/*
ROOT
*/

app.get("/", (req, res) => {

  res.json({
    status: "EVA Core running 🚀",
    service: "eva-core"
  });

});

/*
HEALTH
*/

app.get("/health", (req, res) => {

  res.json({
    ok: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });

});

/*
HOT LEADS RADAR
*/

app.get("/v1/radar/hot-leads", async (req, res) => {

  try {

    const result = await pool.query(`
      SELECT
        phone,
        use_case,
        budget,
        score,
        updated_at
      FROM leads
      WHERE score >= 70
      ORDER BY score DESC
      LIMIT 20
    `);

    return res.json({
      ok: true,
      hot_leads: result.rows
    });

  } catch (error) {

    console.error("radar error", error);

    return res.status(500).json({
      ok: false,
      error: "radar_query_failed"
    });

  }

});

/*
METRICS SUMMARY
*/

app.get("/v1/metrics/summary", async (req, res) => {

  try {

    const hotLeads = await pool.query(`
      SELECT COUNT(*) 
      FROM leads
      WHERE score >= 70
    `);

    const followups = await pool.query(`
      SELECT COUNT(*)
      FROM followups
      WHERE status = 'pending'
    `);

    const conversationsToday = await pool.query(`
      SELECT COUNT(*)
      FROM conversations
      WHERE created_at >= NOW() - INTERVAL '1 day'
    `);

    return res.json({
      ok: true,
      metrics: {
        hot_leads: Number(hotLeads.rows[0].count),
        followups_pending: Number(followups.rows[0].count),
        conversations_today: Number(conversationsToday.rows[0].count)
      }
    });

  } catch (error) {

    console.error("metrics error", error);

    return res.status(500).json({
      ok: false,
      error: "metrics_failed"
    });

  }

});

/*
CONVERSATIONS INBOX
*/

app.get("/v1/conversations", async (req, res) => {

  try {

    const result = await pool.query(`
      SELECT
        c.phone,
        c.created_at,
        l.stage,
        l.score,
        (
          SELECT message
          FROM messages
          WHERE phone = c.phone
          ORDER BY created_at DESC
          LIMIT 1
        ) AS last_message
      FROM conversations c
      LEFT JOIN leads l
      ON l.phone = c.phone
      ORDER BY c.created_at DESC
      LIMIT 50
    `);

    return res.json({
      ok: true,
      conversations: result.rows
    });

  } catch (error) {

    console.error("conversations error", error);

    return res.status(500).json({
      ok: false,
      error: "conversations_failed"
    });

  }

});

/*
INBOUND MESSAGE
*/

app.post("/v1/messages/inbound", async (req, res) => {

  try {

    const payload = validateInbound(req.body);

    const result = await handleInbound(payload);

    return res.json({
      ok: true,
      reply: result.reply,
      intent: result.intent,
      stage: result.stage,
      lead_score: result.lead_score,
      catalog_matches: result.catalog_matches
    });

  } catch (error) {

    console.error(error);

    return res.status(400).json({
      ok: false,
      error: error.message
    });

  }

});

/*
404
*/

app.use((req, res) => {

  res.status(404).json({
    ok: false,
    error: "not_found"
  });

});

const port = process.env.PORT || 3000;

app.listen(port, () => {

  console.log(`EVA Core listening on port ${port}`);

  startFollowupWorker();

});

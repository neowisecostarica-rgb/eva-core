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
        budget_crc,
        urgency_level,
        lead_score,
        updated_at
      FROM leads
      WHERE lead_score >= 70
      ORDER BY lead_score DESC
      LIMIT 20
    `);

    return res.json({
      ok: true,
      hot_leads: result.rows
    });

  } catch (error) {

    console.error("radar error", error);

    return res.status(500).json({
      ok: false
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

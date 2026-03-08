import express from "express";
import dotenv from "dotenv";
import pkg from "pg";

import {
  handleInbound,
  processPendingFollowups,
  getConversationMessages,
  getLeadSummary,
  getMetricsSummary
} from "./salesBrain.js";

dotenv.config();

const { Pool } = pkg;

const app = express();
app.use(express.json());

/**
 * ============================================================
 * DATABASE
 * ============================================================
 */

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "true"
    ? { rejectUnauthorized: false }
    : false
});

/**
 * ============================================================
 * BASIC HEALTH
 * ============================================================
 */

app.get("/", async (req, res) => {
  res.json({
    status: "EVA Core running 🚀",
    service: "eva-core"
  });
});

app.get("/health", async (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/**
 * ============================================================
 * INBOUND MESSAGE (CORE ENDPOINT)
 * ============================================================
 */

app.post("/v1/messages/inbound", async (req, res) => {
  try {

    const {
      api_key,
      from,
      message,
      channel,
      external_message_id,
      metadata
    } = req.body;

    if (!api_key) {
      return res.status(400).json({
        error: "api_key_required"
      });
    }

    if (!from) {
      return res.status(400).json({
        error: "from_required"
      });
    }

    if (!message) {
      return res.status(400).json({
        error: "message_required"
      });
    }

    const result = await handleInbound({
      apiKey: api_key,
      from,
      text: message,
      channel: channel || "whatsapp",
      external_message_id,
      metadata
    });

    res.json(result);

  } catch (error) {

    console.error("inbound error", error);

    res.status(500).json({
      error: "server_error"
    });

  }
});

/**
 * ============================================================
 * GET LEAD
 * ============================================================
 */

app.get("/v1/leads", async (req, res) => {
  try {

    const { organization_id, phone } = req.query;

    if (!organization_id || !phone) {
      return res.status(400).json({
        error: "organization_id_and_phone_required"
      });
    }

    const data = await getLeadSummary(organization_id, phone);

    res.json(data);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "server_error"
    });

  }
});

/**
 * ============================================================
 * GET CONVERSATION MESSAGES
 * ============================================================
 */

app.get("/v1/conversations/:id/messages", async (req, res) => {
  try {

    const conversationId = req.params.id;

    const messages = await getConversationMessages(conversationId);

    res.json(messages);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "server_error"
    });

  }
});

/**
 * ============================================================
 * METRICS SUMMARY
 * ============================================================
 */

app.get("/v1/metrics/summary", async (req, res) => {
  try {

    const { organization_id } = req.query;

    if (!organization_id) {
      return res.status(400).json({
        error: "organization_id_required"
      });
    }

    const metrics = await getMetricsSummary(organization_id);

    res.json(metrics);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "server_error"
    });

  }
});

/**
 * ============================================================
 * FOLLOWUP WORKER
 * ============================================================
 */

async function sendFollowupMessage(payload) {

  console.log("FOLLOWUP:", payload);

  /**
   * Aquí luego conectaremos:
   *
   * WhatsApp Cloud API
   * Twilio
   * Meta Messaging
   *
   */

}

setInterval(async () => {

  try {

    await processPendingFollowups(sendFollowupMessage);

  } catch (error) {

    console.error("followup worker error", error);

  }

}, 60000);

/**
 * ============================================================
 * START SERVER
 * ============================================================
 */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log(`EVA Core listening on port ${PORT}`);

});

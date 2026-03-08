import express from "express";
import dotenv from "dotenv";

import {
  handleInbound,
  processPendingFollowups,
  getConversationMessages,
  getLeadSummary,
  getMetricsSummary
} from "./salesBrain.js";

dotenv.config();

const app = express();
app.use(express.json());

/**
 * =========================================
 * HEALTH
 * =========================================
 */

app.get("/", (req, res) => {
  res.json({
    status: "EVA Core running 🚀",
    service: "eva-core"
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/**
 * =========================================
 * INBOUND MESSAGE
 * =========================================
 */

app.post("/v1/messages/inbound", async (req, res) => {

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
      return res.status(400).json({ error: "api_key_required" });
    }

    if (!from) {
      return res.status(400).json({ error: "from_required" });
    }

    if (!message) {
      return res.status(400).json({ error: "message_required" });
    }

    // ⚠️ ID por defecto si no viene del canal
    const safeExternalId = external_message_id || `local-${Date.now()}-${from}`;

    const result = await handleInbound({
      apiKey: api_key,
      from,
      text: message,
      channel: channel || "whatsapp",
      external_message_id: safeExternalId,
      metadata
    });

    res.json(result);

  } catch (error) {

    console.error("Inbound error:", error);

    // ⚠️ Si el error es duplicado de external_message_id
    if (error.code === "23505") {
      return res.json({
        ok: true,
        duplicate: true
      });
    }

    res.status(500).json({
      error: "server_error"
    });

  }

});

/**
 * =========================================
 * GET LEAD
 * =========================================
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
 * =========================================
 * GET CONVERSATION
 * =========================================
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
 * =========================================
 * METRICS
 * =========================================
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
 * =========================================
 * FOLLOWUP WORKER
 * =========================================
 */

async function sendFollowupMessage(payload) {

  console.log("FOLLOWUP:", payload);

}

setInterval(async () => {

  try {

    await processPendingFollowups(sendFollowupMessage);

  } catch (error) {

    console.error("followup worker error", error);

  }

}, 60000);

/**
 * =========================================
 * START SERVER
 * =========================================
 */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log(`EVA Core listening on port ${PORT}`);

});

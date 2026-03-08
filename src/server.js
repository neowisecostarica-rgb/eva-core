import express from "express";
import dotenv from "dotenv";

import {
  handleInbound,
  processPendingFollowups,
  getConversationMessages,
  getLeadSummary,
  getMetricsSummary
} from "./salesBrain.js";

import { sendWhatsAppMessage } from "./connectors/whatsapp.js";

dotenv.config();

const app = express();
app.use(express.json());

/*
=====================================
Health Check
=====================================
*/

app.get("/", (req, res) => {
  res.json({
    status: "EVA Core running 🚀",
    version: "8.0"
  });
});

/*
=====================================
Inbound API
=====================================
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
      return res.status(400).json({ error: "api_key_required" });
    }

    if (!from) {
      return res.status(400).json({ error: "from_required" });
    }

    if (!message) {
      return res.status(400).json({ error: "message_required" });
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

    console.error("Inbound error:", error);

    res.status(500).json({
      error: "server_error"
    });

  }

});

/*
=====================================
Conversations
=====================================
*/

app.get("/v1/conversations/:id/messages", async (req, res) => {

  try {

    const messages = await getConversationMessages(req.params.id);

    res.json(messages);

  } catch (error) {

    console.error(error);

    res.status(500).json({ error: "server_error" });

  }

});

/*
=====================================
Leads
=====================================
*/

app.get("/v1/leads/:phone", async (req, res) => {

  try {

    const lead = await getLeadSummary(req.params.phone);

    res.json(lead);

  } catch (error) {

    console.error(error);

    res.status(500).json({ error: "server_error" });

  }

});

/*
=====================================
Metrics
=====================================
*/

app.get("/v1/metrics/summary", async (req, res) => {

  try {

    const metrics = await getMetricsSummary();

    res.json(metrics);

  } catch (error) {

    console.error(error);

    res.status(500).json({ error: "server_error" });

  }

});

/*
=====================================
Followup Worker
=====================================
*/

setInterval(async () => {

  try {

    await processPendingFollowups();

  } catch (error) {

    console.error("Followup worker error:", error);

  }

}, 30000);

/*
=====================================
WhatsApp Verification
=====================================
*/

app.get("/webhooks/whatsapp", (req, res) => {

  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  res.sendStatus(403);

});

/*
=====================================
WhatsApp Webhook Receiver
=====================================
*/

app.post("/webhooks/whatsapp", async (req, res) => {

  try {

    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    const message = value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    const from = message.from;
    const text = message.text?.body || "";
    const messageId = message.id;

    console.log("WhatsApp inbound:", from, text);

    const result = await handleInbound({
      apiKey: process.env.DEFAULT_ORG_API_KEY,
      from,
      text,
      channel: "whatsapp",
      external_message_id: messageId,
      metadata: {
        source: "whatsapp_cloud"
      }
    });

    if (result?.reply) {

      await sendWhatsAppMessage({
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
        token: process.env.WHATSAPP_TOKEN,
        to: from,
        text: result.reply
      });

    }

    res.sendStatus(200);

  } catch (error) {

    console.error("WhatsApp webhook error:", error);

    res.sendStatus(500);

  }

});

/*
=====================================
Server Start
=====================================
*/

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log(`EVA Core running 🚀 on port ${PORT}`);

});

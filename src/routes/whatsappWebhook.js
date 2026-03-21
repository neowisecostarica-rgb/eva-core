console.log("🧪 TOKEN:", process.env.WHATSAPP_TOKEN?.slice(0, 15));

import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const EVA_ENDPOINT = process.env.EVA_ENDPOINT;
const EVA_API_KEY = process.env.EVA_API_KEY;

// VERIFY WEBHOOK
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

// RECEIVE MESSAGE
router.post("/", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    const phone = message.from;
    const text = message.text?.body || "";

    console.log("📩 Incoming WhatsApp:", { phone, text });

    // SEND TO EVA CORE
    const evaResponse = await fetch(`${EVA_ENDPOINT}/v1/messages/inbound`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": EVA_API_KEY
      },
      body: JSON.stringify({
        organization_id: "db83e3f9-d971-4ed1-9b6d-82408fbd7c03",
        phone,
        text,
        channel: "whatsapp"
      })
    });

    const data = await evaResponse.json();

    const replyText = data?.reply?.text;

    if (!replyText) {
      return res.sendStatus(200);
    }

    // SEND BACK TO WHATSAPP
    const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        text: { body: replyText }
      })
    });

    console.log("📤 Sent to WhatsApp:", replyText);

    return res.sendStatus(200);

  } catch (error) {
    console.error("❌ Webhook error:", error);
    return res.sendStatus(500);
  }
});

export default router;

import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const EVA_ENDPOINT = process.env.EVA_ENDPOINT;

/* ======================================
   Webhook verification
====================================== */

router.get("/webhook/whatsapp", (req, res) => {

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified");
    return res.status(200).send(challenge);
  }

  res.sendStatus(403);

});

/* ======================================
   Receive messages
====================================== */

router.post("/webhook/whatsapp", async (req, res) => {

  try {

    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    const message = value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    const phone = message.from;
    const text = message.text?.body;

    if (!text) {
      return res.sendStatus(200);
    }

    /* ===============================
       Send to EVA Core
    =============================== */

    const evaResponse = await fetch(`${EVA_ENDPOINT}/v1/messages/inbound`, {

      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.EVA_API_KEY
      },

      body: JSON.stringify({
        phone,
        message: text
      })

    });

    const evaData = await evaResponse.json();

    const reply = evaData.reply;

    /* ===============================
       Send reply to WhatsApp
    =============================== */

    await fetch(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {

      method: "POST",

      headers: {
        "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },

      body: JSON.stringify({

        messaging_product: "whatsapp",

        to: phone,

        text: {
          body: reply
        }

      })

    });

    res.sendStatus(200);

  } catch (err) {

    console.error("whatsapp webhook error", err);

    res.sendStatus(500);

  }

});

export default router;

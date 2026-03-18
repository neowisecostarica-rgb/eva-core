/*
====================================================
EVA WHATSAPP WEBHOOK (PRODUCTION READY)
====================================================
*/

import express from "express";
import axios from "axios";

const router = express.Router();

/*
====================================================
CONFIG
====================================================
*/

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const EVA_API_URL = process.env.EVA_API_URL;
const EVA_API_KEY = process.env.EVA_API_KEY;

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

/*
====================================================
VERIFY WEBHOOK (GET)
====================================================
*/

router.get("/", (req, res) => {

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado");
    return res.status(200).send(challenge);
  }

  console.error("❌ Webhook verification failed");
  return res.sendStatus(403);
});

/*
====================================================
RECEIVE MESSAGES (POST)
====================================================
*/

router.post("/", async (req, res) => {

  try {

    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    const message = value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    const phone = message.from;
    const text = message.text?.body || "";

    console.log("📩 Incoming WhatsApp:", { phone, text });

    /*
    ====================================================
    SEND TO EVA CORE (SECURE)
    ====================================================
    */

    const evaResponse = await axios.post(
      `${EVA_API_URL}/v1/messages/inbound`,
      {
        phone,
        text
      },
      {
        headers: {
          Authorization: `Bearer ${EVA_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply = evaResponse.data?.reply?.text || "Gracias por escribirnos 🙌";

    /*
    ====================================================
    SEND REPLY TO WHATSAPP
    ====================================================
    */

    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: phone,
        text: { body: reply }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    return res.sendStatus(200);

  } catch (err) {

    console.error("❌ WHATSAPP WEBHOOK ERROR:", {
      message: err.message,
      response: err.response?.data
    });

    return res.sendStatus(500);
  }
});

export default router;

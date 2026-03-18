/*
====================================================
EVA WHATSAPP WEBHOOK (FULL HARDENED VERSION)
====================================================
*/

import express from "express";
import axios from "axios";
import {
  webhookRateLimit,
  basicSecurityHeaders
} from "../lib/security.js";

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
GLOBAL MIDDLEWARE
====================================================
*/

router.use(basicSecurityHeaders);
router.use(webhookRateLimit);

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

    console.log("📩 Incoming WhatsApp:", {
      phone,
      text_length: text.length
    });

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
    const media = evaResponse.data?.reply?.media || [];

    /*
    ====================================================
    SEND TEXT REPLY
    ====================================================
    */

    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: {
          body: reply
        }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    /*
    ====================================================
    SEND MEDIA REPLY
    ====================================================
    */

    if (Array.isArray(media) && media.length > 0) {
      for (const url of media) {
        try {
          await axios.post(
            `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
            {
              messaging_product: "whatsapp",
              to: phone,
              type: "image",
              image: { link: url }
            },
            {
              headers: {
                Authorization: `Bearer ${WHATSAPP_TOKEN}`,
                "Content-Type": "application/json"
              }
            }
          );
        } catch (err) {
          console.warn("⚠️ media send error:", err.message);
        }
      }
    }

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

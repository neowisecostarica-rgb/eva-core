/*
====================================================
WHATSAPP WEBHOOK (INBOUND) - CLEAN VERSION
====================================================
*/

import express from "express";
import fetch from "node-fetch";

const router = express.Router();

/* ======================================
   ENV
====================================== */

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const EVA_ENDPOINT = process.env.EVA_ENDPOINT;
const EVA_API_KEY = process.env.EVA_API_KEY;

/* ======================================
   DEBUG
====================================== */

console.log("📡 WhatsApp ENV:", {
  VERIFY_TOKEN: VERIFY_TOKEN ? "OK" : "MISSING",
  WHATSAPP_TOKEN: WHATSAPP_TOKEN ? "OK" : "MISSING",
  PHONE_NUMBER_ID: PHONE_NUMBER_ID || "MISSING",
  EVA_ENDPOINT: EVA_ENDPOINT || "MISSING"
});

/* ======================================
   WEBHOOK VERIFICATION
====================================== */

router.get("/", (req, res) => {

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  }

  console.log("❌ Webhook verification failed");
  return res.sendStatus(403);

});

/* ======================================
   RECEIVE MESSAGES
====================================== */

router.post("/", async (req, res) => {

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

    console.log("📩 Incoming WhatsApp:", {
      phone,
      text,
      text_length: text?.length || 0
    });

    if (!text) {
      return res.sendStatus(200);
    }

    /* ======================================
       VALIDATE CONFIG
    ====================================== */

    if (!EVA_ENDPOINT) {
      console.error("❌ EVA_ENDPOINT missing");
      return res.sendStatus(500);
    }

    if (!PHONE_NUMBER_ID || !WHATSAPP_TOKEN) {
      console.error("❌ WhatsApp config missing");
      return res.sendStatus(500);
    }

    /* ======================================
       SEND TO EVA CORE
    ====================================== */

    const evaResponse = await fetch(`${EVA_ENDPOINT}/v1/messages/inbound`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": EVA_API_KEY
      },
      body: JSON.stringify({
        phone,
        text
      })
    });

    const evaData = await evaResponse.json();

    const replyText = evaData?.reply?.text || "Error generando respuesta";
    const replyMedia = evaData?.reply?.media || [];

    console.log("🧠 EVA reply TEXT:", replyText);
    console.log("🧠 EVA reply MEDIA:", replyMedia);

    /* ======================================
       SEND TEXT TO WHATSAPP
    ====================================== */

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
        type: "text",
        text: {
          body: replyText
        }
      })
    });

    /* ======================================
       SEND MEDIA (OPTIONAL)
    ====================================== */

    if (Array.isArray(replyMedia) && replyMedia.length > 0) {

      for (const mediaUrl of replyMedia) {

        await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: phone,
            type: "image",
            image: {
              link: mediaUrl
            }
          })
        });

      }

      console.log("🖼️ MEDIA SENT:", replyMedia.length);

    }

    return res.sendStatus(200);

  } catch (err) {

    console.error("❌ WHATSAPP WEBHOOK ERROR:", err);

    return res.sendStatus(500);

  }

});

export default router;

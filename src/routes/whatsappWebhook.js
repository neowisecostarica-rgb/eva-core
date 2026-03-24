/*
====================================================
WHATSAPP WEBHOOK — EVA CORE (FINAL STABLE VERSION)
====================================================
*/

import express from "express";
import fetch from "node-fetch";
import { splitReply } from "../brain/utils/splitReply.js";

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

console.log("📡 WHATSAPP CONFIG:", {
  VERIFY_TOKEN: VERIFY_TOKEN ? "OK" : "MISSING",
  WHATSAPP_TOKEN: WHATSAPP_TOKEN ? "OK" : "MISSING",
  PHONE_NUMBER_ID,
  EVA_ENDPOINT,
  EVA_API_KEY: EVA_API_KEY ? "OK" : "MISSING"
});

/* ======================================
   VERIFY
====================================== */

router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  }

  console.error("❌ Webhook verification failed");
  return res.sendStatus(403);
});

/* ======================================
   EXTRACT MESSAGE SAFELY
====================================== */

function extractText(message) {
  if (!message) return "";

  if (message.type === "text") {
    return message.text?.body || "";
  }

  return "[unsupported_message_type]";
}

/* ======================================
   MAIN HANDLER
====================================== */

router.post("/", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const phone = message.from;
    const text = extractText(message);

    // ✅ ID REAL DE WHATSAPP (CLAVE PARA IDEMPOTENCIA)
    const message_id = message.id || null;

    console.log("📩 Incoming:", {
      phone,
      text,
      type: message.type,
      message_id
    });

    if (!EVA_ENDPOINT || !EVA_API_KEY) {
      console.error("❌ EVA CONFIG MISSING");
      return res.sendStatus(500);
    }

    /* ======================================
       CALL EVA CORE
    ====================================== */

    const evaResponse = await fetch(`${EVA_ENDPOINT}/v1/messages/inbound`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": EVA_API_KEY
      },
      body: JSON.stringify({
        phone,
        text,
        channel: "whatsapp",
        message_id
      })
    });

    if (!evaResponse.ok) {
      const err = await evaResponse.text();
      console.error("❌ EVA ERROR:", err);
      return res.sendStatus(500);
    }

    const data = await evaResponse.json();

    console.log("🧠 EVA RESPONSE:", data);

    const replyText = data?.reply?.text;
    const isDuplicate = data?.meta?.duplicate === true;

    /* ======================================
       IDEMPOTENCY HANDLING
    ====================================== */

    if (!replyText) {
      if (isDuplicate) {
        console.log("♻️ Duplicate detected — no reply sent");
      } else {
        console.warn("⚠️ EVA sin respuesta válida");
      }

      return res.sendStatus(200);
    }

    // 🔒 Protección extra
    if (isDuplicate) {
      return res.sendStatus(200);
    }

    /* ======================================
       SEND TO WHATSAPP
    ====================================== */

    const messages = splitReply(replyText);

    for (const msg of messages) {
      const waResponse = await fetch(
        `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: phone,
            text: { body: msg }
          })
        }
      );

      const waData = await waResponse.json();

      console.log("✅ WhatsApp OK:", waData);

      // delay humano
      await new Promise((res) => setTimeout(res, 1200));
    }

    return res.sendStatus(200);

  } catch (error) {
    console.error("❌ WEBHOOK ERROR:", error);
    return res.sendStatus(500);
  }
});

export default router;

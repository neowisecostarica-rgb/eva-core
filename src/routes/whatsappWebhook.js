/*
====================================================
WHATSAPP WEBHOOK — EVA CORE (STABILIZATION PACK v2)
====================================================
*/

import express from "express";

import { splitReply } from "../brain/utils/splitReply.js";

import {
  extractReplyFromMessagesRouteResponse,
  validateMessagesRouteResponse
} from "../system/contracts/runtimeContract.js";

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
   IDEMPOTENCY MEMORY
====================================== */

const processedMessages = new Set();

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

  console.log("📡 VERIFY REQUEST:", req.query);

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  }

  console.error("Webhook verification failed");

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
    const message_id = message.id || null;

    console.log("WhatsApp inbound received:", { type: message.type, hasMessageId: !!message_id });

    /* ======================================
       🔥 IDENTITY / DUPLICATE BLOCK
    ====================================== */

    if (message_id && processedMessages.has(message_id)) {
      console.log("⚠️ Duplicate message skipped:", message_id);
      return res.sendStatus(200);
    }

    if (message_id) {
      processedMessages.add(message_id);
    }

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
      console.error("EVA upstream error status:", evaResponse.status);
      return res.sendStatus(500);
    }

    const data = await evaResponse.json();

    // Do not log customer conversation content.

    /* ======================================
       CONTRACT VALIDATION
    ====================================== */

    try {
      validateMessagesRouteResponse(data);
    } catch (contractError) {
      console.error("❌ CONTRACT VIOLATION (WEBHOOK)", {
        message: contractError.message,
        data
      });

      return res.sendStatus(500);
    }

    /* ======================================
       EXTRACT REPLY
    ====================================== */

    const { text: replyText, meta } =
      extractReplyFromMessagesRouteResponse(data);

    if (meta?.duplicate === true) {
      console.log("♻️ Duplicate detected (core)");
      return res.sendStatus(200);
    }

    if (!replyText) {
      console.warn("⚠️ EMPTY_REPLY_AFTER_CONTRACT");
      return res.sendStatus(200);
    }

    /* ======================================
       SEND TO WHATSAPP (🔥 SINGLE MESSAGE)
    ====================================== */

    const msg = splitReply(replyText)[0];

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

    console.log("WhatsApp response status:", waResponse.status);

    return res.sendStatus(200);

  } catch (error) {
    console.error("❌ WEBHOOK ERROR:", error);
    return res.sendStatus(500);
  }
});

export default router;

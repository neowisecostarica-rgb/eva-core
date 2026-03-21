/*
====================================================
WHATSAPP WEBHOOK — EVA CORE (STABLE + DEBUG + SAFE)
====================================================
*/

import express from "express";
import fetch from "node-fetch";

const router = express.Router();

/* ======================================
   ENV (NO CAMBIAR NOMBRES)
====================================== */

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const EVA_ENDPOINT = process.env.EVA_ENDPOINT;
const EVA_API_KEY = process.env.EVA_API_KEY;

/* ======================================
   DEBUG INICIAL (CLAVE PARA DETECTAR ERRORES)
====================================== */

console.log("📡 WHATSAPP WEBHOOK CONFIG:");
console.log("VERIFY_TOKEN:", VERIFY_TOKEN ? "OK" : "MISSING");
console.log("WHATSAPP_TOKEN:", WHATSAPP_TOKEN ? "OK" : "MISSING");
console.log("PHONE_NUMBER_ID:", PHONE_NUMBER_ID || "MISSING");
console.log("EVA_ENDPOINT:", EVA_ENDPOINT || "MISSING");
console.log("EVA_API_KEY:", EVA_API_KEY ? "OK" : "MISSING");

/* ======================================
   VERIFY WEBHOOK (META)
====================================== */

router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  } else {
    console.error("❌ Webhook verification failed");
    return res.sendStatus(403);
  }
});

/* ======================================
   RECEIVE MESSAGE (WHATSAPP → EVA → WHATSAPP)
====================================== */

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

    /* ======================================
       VALIDACIÓN CRÍTICA (ANTI SILENT FAIL)
    ====================================== */

    if (!EVA_ENDPOINT || !EVA_API_KEY) {
      console.error("❌ EVA CONFIG MISSING");
      return res.sendStatus(500);
    }

    /* ======================================
       CALL EVA CORE
    ====================================== */

    const evaUrl = `${EVA_ENDPOINT}/v1/messages/inbound`;

    console.log("📡 Sending to EVA:", evaUrl);

    const evaResponse = await fetch(evaUrl, {
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

    if (!evaResponse.ok) {
      const errorText = await evaResponse.text();
      console.error("❌ EVA ERROR:", errorText);
      return res.sendStatus(500);
    }

    const data = await evaResponse.json();

    console.log("🧠 EVA RAW RESPONSE:", data);

    const replyText = data?.reply?.text;

    if (!replyText) {
      console.warn("⚠️ EVA respondió sin texto");
      return res.sendStatus(200);
    }

    /* ======================================
       SEND BACK TO WHATSAPP
    ====================================== */

    const whatsappUrl = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

    console.log("📤 Sending to WhatsApp:", whatsappUrl);

    const waResponse = await fetch(whatsappUrl, {
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

    const waData = await waResponse.json();

    console.log("✅ WhatsApp response:", waData);

    return res.sendStatus(200);

  } catch (error) {
    console.error("❌ Webhook error:", error);
    return res.sendStatus(500);
  }
});

export default router;

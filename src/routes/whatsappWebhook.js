/*
====================================================
EVA WHATSAPP WEBHOOK
Meta Cloud API Integration
====================================================
*/

import express from "express";
import axios from "axios";
import { handleInbound } from "../salesBrain.js";

const router = express.Router();

/*
====================================================
VERIFY WEBHOOK
====================================================
*/

router.get("/", (req, res) => {

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

/*
====================================================
RECEIVE MESSAGES
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

    /*
    IGNORE NON TEXT MESSAGES
    PREVENT LOOP
    */

    if (!message.text || !message.text.body) {
      return res.sendStatus(200);
    }

    const phone = message.from;
    const text = message.text.body;

    /*
    SEND TO EVA CORE (CORRECT PAYLOAD)
    */

    const messageId = message.id || `${message.from}-${Date.now()}`;

const result = await handleInbound({
  organization_id: process.env.DEFAULT_ORGANIZATION_ID,
  payload: {
    phone,
    text,
    channel: "whatsapp",
    external_message_id: messageId
  }
});
      }
    });

    const reply = result?.reply || "Hola 👋 Soy EVA de Compu Store Costa Rica, ¿en qué puedo ayudarte hoy?";

    /*
    SEND REPLY BACK TO WHATSAPP
    */

    await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: phone,
        text: { body: reply }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    return res.sendStatus(200);

  } catch (err) {

    console.error("WHATSAPP WEBHOOK ERROR", {
      message: err.message,
      response: err?.response?.data
    });

    return res.sendStatus(500);

  }

});

export default router;

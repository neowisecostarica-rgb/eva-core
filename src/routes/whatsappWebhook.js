/*
====================================================
EVA WHATSAPP WEBHOOK
Meta Cloud API Integration
====================================================
*/

import express from "express";
import axios from "axios";

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

    const phone = message.from;
    const text = message.text?.body || "";

    /*
    SEND TO EVA CORE
    */

    const response = await axios.post(
      `${process.env.EVA_API_URL}/v1/messages/inbound`,
      {
        phone,
        message: text,
        organization_id: process.env.DEFAULT_ORGANIZATION_ID
      }
    );

    const reply = response.data?.reply || "Gracias por escribirnos.";

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

    res.sendStatus(200);

  } catch (err) {

    console.error("WHATSAPP WEBHOOK ERROR", err);

    res.sendStatus(500);

  }

});

export default router;

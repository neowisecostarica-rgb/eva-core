/*
====================================================
EVA WHATSAPP WEBHOOK (STABLE VERSION)
====================================================
*/

import express from "express";
import axios from "axios";
import { handleInbound } from "../salesBrain.js";

const router = express.Router();

/*
====================================================
VERIFY WEBHOOK (META)
====================================================
*/

router.get("/", (req, res) => {

  const verify_token = process.env.WHATSAPP_VERIFY_TOKEN;

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === verify_token) {
    console.log("✅ Webhook verified");
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

    console.log("📲 WhatsApp inbound:", { phone, text });

    /*
    ====================================================
    SEND TO EVA CORE
    ====================================================
    */

    const evaResponse = await handleInbound({
      organization_id: process.env.DEFAULT_ORGANIZATION_ID,
      phone,
      text
    });

    const reply = evaResponse?.reply?.text || "Gracias por escribirnos 🙌";
    const media = evaResponse?.reply?.media || [];

    console.log("🤖 EVA reply:", reply);

    /*
    ====================================================
    SEND TEXT MESSAGE
    ====================================================
    */

    await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
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
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    /*
    ====================================================
    SEND MEDIA (IMAGES)
    ====================================================
    */

    if (Array.isArray(media) && media.length > 0) {
      for (const url of media) {
        try {
          await axios.post(
            `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
            {
              messaging_product: "whatsapp",
              to: phone,
              type: "image",
              image: { link: url }
            },
            {
              headers: {
                Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
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
      data: err.response?.data
    });

    return res.sendStatus(200);
  }
});

export default router;

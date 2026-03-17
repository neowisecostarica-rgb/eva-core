import express from "express";
import axios from "axios";
import { handleInbound } from "../salesBrain.js";

const router = express.Router();

/*
====================================================
WEBHOOK VERIFICATION (META)
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
WEBHOOK RECEIVE
====================================================
*/

router.post("/", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    // 🔴 IGNORAR EVENTOS DE STATUS (DELIVERED, READ, ETC)
    if (value?.statuses) {
      return res.sendStatus(200);
    }

    const message = value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    // 🔴 SOLO PROCESAR MENSAJES DE TEXTO
    if (message.type !== "text") {
      return res.sendStatus(200);
    }

    // 🔴 VALIDAR QUE TENGA BODY
    if (!message.text?.body) {
      return res.sendStatus(200);
    }

    // 🔴 IGNORAR MENSAJES ENVIADOS POR NOSOTROS (EVITA LOOP)
    const businessPhoneId = value?.metadata?.phone_number_id;

    if (message.from === businessPhoneId) {
      return res.sendStatus(200);
    }

    /*
    ====================================================
    EXTRACT DATA
    ====================================================
    */

    const phone = message.from;
    const text = message.text.body;

    const messageId =
      message.id || `${message.from}-${Date.now()}`;

    /*
    ====================================================
    SEND TO EVA CORE
    ====================================================
    */

    const result = await handleInbound({
      organization_id: process.env.DEFAULT_ORGANIZATION_ID,
      payload: {
        phone,
        text,
        channel: "whatsapp",
        external_message_id: messageId
      }
    });

    const reply =
      result?.reply ||
      "Hola 👋 Soy EVA de Compu Store Costa Rica, ¿en qué puedo ayudarte hoy?";

    /*
    ====================================================
    SEND REPLY TO WHATSAPP
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

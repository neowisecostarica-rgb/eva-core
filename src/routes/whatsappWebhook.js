import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const EVA_ENDPOINT = process.env.EVA_ENDPOINT;
const EVA_API_KEY = process.env.EVA_API_KEY;

/* ======================================
   VERIFY WEBHOOK
====================================== */
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

/* ======================================
   RECEIVE MESSAGE
====================================== */
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

    // 🔥 CLAVE: ID único del mensaje
    const external_message_id = message.id;

    console.log("📩 Incoming WhatsApp:", {
      phone,
      text,
      id: external_message_id
    });

    /* ======================================
       SEND TO EVA (NUEVO CONTRATO)
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
        external_message_id
      })
    });

    const evaData = await evaResponse.json();

    const replyText =
      evaData?.data?.reply?.text ||
      "Gracias por escribir 🙌";

    console.log("🧠 EVA reply:", replyText);

    /* ======================================
       SEND BACK TO WHATSAPP
    ====================================== */

    await fetch(
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
          text: { body: replyText }
        })
      }
    );

    return res.sendStatus(200);

  } catch (error) {
    console.error("❌ WHATSAPP ERROR:", error.message);
    return res.sendStatus(500);
  }
});

export default router;

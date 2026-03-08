import express from "express";
import dotenv from "dotenv";

import { validateInbound } from "./validators.js";
import { handleInbound } from "./salesBrain.js";

dotenv.config();

const app = express();

app.use(express.json({ limit: "1mb" }));

/*
ROOT
*/

app.get("/", (req, res) => {
  res.json({
    status: "EVA Core running 🚀",
    service: "eva-core"
  });
});

/*
HEALTH
*/

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/*
WHATSAPP WEBHOOK VERIFICATION
*/

app.get("/whatsapp/webhook", (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === verifyToken) {
    console.log("WhatsApp webhook verified");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

/*
WHATSAPP INBOUND
*/

app.post("/whatsapp/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    const phone = message.from;
    const text = message.text?.body || "";

    const payload = validateInbound({
      organization_id: process.env.DEFAULT_ORG_ID,
      phone,
      message: text
    });

    const result = await handleInbound(payload);

    console.log("EVA reply:", result.reply);

    /*
    Aquí luego enviaremos respuesta a WhatsApp
    */

    return res.sendStatus(200);

  } catch (error) {
    console.error("whatsapp webhook error", error);
    return res.sendStatus(500);
  }
});

/*
DIRECT API
*/

app.post("/v1/messages/inbound", async (req, res) => {
  try {
    const payload = validateInbound(req.body);

    const result = await handleInbound(payload);

    return res.json({
      ok: true,
      reply: result.reply,
      intent: result.intent,
      stage: result.stage,
      catalog_matches: result.catalog_matches
    });

  } catch (error) {
    console.error(error);

    return res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

/*
404
*/

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "not_found"
  });
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`EVA Core listening on port ${port}`);
});

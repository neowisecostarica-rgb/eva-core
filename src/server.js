import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { CONFIG } from "./config.js";
import { validateEnv } from "./configValidator.js";

import whatsappWebhook from "./routes/whatsappWebhook.js";
import messagesRouter from "./routes/messages.js";

dotenv.config();

// 🔐 VALIDAR ENV ANTES DE TODO
validateEnv();

const app = express();
const PORT = process.env.PORT || 10000;

// MIDDLEWARES
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// HEALTH
app.get(CONFIG.routes.health, (req, res) => {
  return res.json({
    ok: true,
    service: "eva-core"
  });
});

// ROUTES
app.use(CONFIG.routes.webhook, whatsappWebhook);
app.use("/v1/messages", messagesRouter);

// START
app.listen(PORT, () => {
  console.log(`🚀 EVA Core running on port ${PORT}`);
});

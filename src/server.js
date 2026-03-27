import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { CONFIG } from "./config.js";
import { validateEnv } from "./configValidator.js";

import whatsappWebhook from "./routes/whatsappWebhook.js";
import messagesRouter from "./routes/messages.js";
import metricsRouter from "./routes/metrics.js";

import pool from "./db.js";

// 🔥 NUEVO
import { registerConversationRoutes } from "./api/conversations.js";
import { registerLeadRoutes } from "./api/leads.js";

// 🔐 AUTH (para proteger endpoints)
import { authenticate } from "./lib/auth.js";

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

// 🔥 CORE (YA TENÍAS)
app.use("/v1/messages", messagesRouter);

// 🔥 NUEVO: METRICS (protegido)
app.use("/v1/metrics", authenticate, metricsRouter);

// 🔥 NUEVO: API DASHBOARD (REUTILIZANDO LO QUE YA EXISTE)
registerConversationRoutes(app, pool);
registerLeadRoutes(app, pool);

// START
app.listen(PORT, () => {
  console.log(`🚀 EVA Core running on port ${PORT}`);
});

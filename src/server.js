import { startFollowupWorker } from "./followupWorker.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { CONFIG } from "./config.js";
import { validateEnv } from "./configValidator.js";

import whatsappWebhook from "./routes/whatsappWebhook.js";
import messagesRouter from "./routes/messages.js";
import metricsRouter from "./routes/metrics.js";

// 🔥 NUEVO: PRODUCTS ROUTES
import productsRoutes from "./routes/products.js";

import pool from "./db.js";

// 🔥 DASHBOARD API
import { registerConversationRoutes } from "./api/conversations.js";
import { registerLeadRoutes } from "./api/leads.js";

// 🔐 AUTH
import { authenticate } from "./lib/auth.js";

dotenv.config();

// 🔐 VALIDAR ENV
validateEnv();

const app = express();
const PORT = process.env.PORT || 10000;

/*
====================================================
MIDDLEWARES
====================================================
*/
app.use(cors());
app.use(express.json({ limit: "2mb" }));

/*
====================================================
HEALTH
====================================================
*/
app.get(CONFIG.routes.health, (req, res) => {
  return res.json({
    ok: true,
    service: "eva-core"
  });
});

/*
====================================================
WEBHOOK
====================================================
*/
app.use(CONFIG.routes.webhook, whatsappWebhook);

/*
====================================================
CORE ROUTES
====================================================
*/
app.use("/v1/messages", messagesRouter);

/*
====================================================
METRICS (PROTEGIDO)
====================================================
*/
app.use("/v1/metrics", authenticate, metricsRouter);

/*
====================================================
PRODUCTS (🔥 NUEVO - CRÍTICO SOT)
====================================================
*/
app.use("/v1/products", authenticate, productsRoutes);

/*
====================================================
DASHBOARD APIs
====================================================
*/
registerConversationRoutes(app, pool);

// ⚠️ FIX IMPORTANTE: esto estaba mal antes
app.use("/v1/leads", authenticate);
registerLeadRoutes(app, pool);

/*
====================================================
START
====================================================
*/
app.listen(PORT, () => {
  console.log(`🚀 EVA Core running on port ${PORT}`);
});

// ================================
// FOLLOWUP WORKER ADAPTER
// ================================
import { startFollowupWorker } from "./followupWorker.js";

async function sendWhatsAppMessage({ phone, message }) {
  try {
    await fetch(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { body: message },
        }),
      }
    );

    console.log("📤 Followup WhatsApp sent");
  } catch (err) {
    console.error("❌ WhatsApp send error:", err);
  }
}

// ================================
// START FOLLOWUP WORKER
// ================================
startFollowupWorker(sendWhatsAppMessage);

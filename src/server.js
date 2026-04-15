/*
====================================================
EVA CORE — SERVER (Production Safe vNext)
====================================================
*/

import { startFollowupWorker } from "./followupWorker.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { CONFIG } from "./config.js";
import { validateEnv } from "./configValidator.js";

import whatsappWebhook from "./routes/whatsappWebhook.js";
import messagesRouter from "./routes/messages.js";
import metricsRouter from "./routes/metrics.js";
import productsRoutes from "./routes/products.js";

import pool from "./db.js";

import { registerConversationRoutes } from "./api/conversations.js";
import { registerLeadRoutes } from "./api/leads.js";

import { authenticate } from "./lib/auth.js";

dotenv.config();

/*
====================================================
ENV VALIDATION
====================================================
*/
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
    service: "eva-core",
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
METRICS
====================================================
*/
app.use("/v1/metrics", authenticate, metricsRouter);

/*
====================================================
PRODUCTS
====================================================
*/
app.use("/v1/products", authenticate, productsRoutes);

/*
====================================================
SETUP (BUSINESS + EVA PERSONA)
====================================================
*/
import setupRoutes from "./routes/setup.js";

app.use("/v1/setup", setupRoutes);
/*
====================================================
DASHBOARD APIs
====================================================
*/
registerConversationRoutes(app, pool);

app.use("/v1/leads", authenticate);
registerLeadRoutes(app, pool);

/*
====================================================
START SERVER
====================================================
*/
app.listen(PORT, () => {
  console.log("🚀 EVA CORE STARTED");
  console.log("PORT:", PORT);
  console.log("ENV:", process.env.NODE_ENV || "development");
});

/*
====================================================
WHATSAPP SEND (PRODUCTION SAFE)
====================================================
*/

async function sendWhatsAppMessage({ phone, message }) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
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

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ WhatsApp send failed:", {
        phone,
        error: data,
      });
      return { success: false, error: data };
    }

    console.log("📤 WhatsApp sent:", phone);

    return { success: true, data };

  } catch (err) {
    console.error("❌ WhatsApp send error:", err.message);
    return { success: false, error: err.message };
  }
}

/*
====================================================
FOLLOWUP WORKER
====================================================
*/
startFollowupWorker(sendWhatsAppMessage);

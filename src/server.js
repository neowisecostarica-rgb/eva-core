import express from "express";
import dotenv from "dotenv";

import messagesRoute from "./routes/messages.js";
import metricsRoute from "./routes/metrics.js";
import { startFollowupWorker } from "./followupWorker.js";
import devChatRoute from "./routes/devChat.js";
import devChatUIRoute from "./routes/devChatUI.js";
import { startFollowupWorker } from "./followupWorker.js";

dotenv.config();

const app = express();

/* ===============================
   BASIC SECURITY
================================ */

// limitar tamaño de JSON
app.use(express.json({ limit: "1mb" }));

// rate limit simple en memoria
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minuto
const RATE_LIMIT_MAX = 120;

const rateMap = new Map();

app.use((req, res, next) => {
  const ip =
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress ||
    "unknown";

  const now = Date.now();

  if (!rateMap.has(ip)) {
    rateMap.set(ip, { count: 1, time: now });
    return next();
  }

  const entry = rateMap.get(ip);

  if (now - entry.time > RATE_LIMIT_WINDOW) {
    rateMap.set(ip, { count: 1, time: now });
    return next();
  }

  entry.count++;

  if (entry.count > RATE_LIMIT_MAX) {
    return res.status(429).json({
      error: "rate_limit_exceeded"
    });
  }

  next();
});

/* ===============================
   ROOT
================================ */

app.get("/", (req, res) => {
  res.json({
    status: "EVA Core running 🚀"
  });
});

/* ===============================
   HEALTH CHECK
================================ */

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "eva-core",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/* ===============================
   ROUTES
================================ */

app.use("/v1/messages", messagesRoute);
app.use("/v1/metrics", metricsRoute);
app.use("/dev", devChatRoute);
app.use("/dev", devChatUIRoute);

/* ===============================
   FOLLOWUP WORKER
================================ */

startFollowupWorker(sendWhatsAppMessage);

/* ===============================
   SERVER START
================================ */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`EVA Core running on port ${PORT}`);
});

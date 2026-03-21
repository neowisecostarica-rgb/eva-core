import express from "express";
import cors from "cors";
import messagesRouter from "./routes/messages.js";
import whatsappWebhook from "./routes/whatsappWebhook.js";
import metricsRouter from "./routes/metrics.js";

const app = express();

app.use(cors());
app.use(express.json());

/* ======================================
   HEALTH CHECK
====================================== */
app.get("/", (req, res) => {
  res.send("EVA Core running 🚀");
});

/* ======================================
   ROUTES
====================================== */

// ✅ NUEVO ESTÁNDAR
app.use("/v1/messages", messagesRouter);

// WhatsApp webhook
app.use("/webhook/whatsapp", whatsappWebhook);

// Metrics (se arregla en siguiente bloque)
app.use("/v1/metrics", metricsRouter);

/* ======================================
   START
====================================== */

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`EVA Core running on port ${PORT}`);
});

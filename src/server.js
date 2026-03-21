import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import whatsappWebhook from "./routes/whatsappWebhook.js";
import messagesRouter from "./routes/messages.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// MIDDLEWARES
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// HEALTH CHECK
app.get("/health", (req, res) => {
  return res.json({
    ok: true,
    service: "eva-core"
  });
});

// ROUTES
app.use("/webhook", whatsappWebhook);
app.use("/v1/messages", messagesRouter);

// START SERVER
app.listen(PORT, () => {
  console.log(`EVA Core running on port ${PORT}`);
});

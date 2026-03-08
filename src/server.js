import express from "express";
import dotenv from "dotenv";
import { handleInboundMessage } from "./salesBrain.js";

dotenv.config();

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    status: "EVA Core running 🚀"
  });
});

app.post("/v1/messages/inbound", async (req, res) => {
  try {

    const payload = req.body;

    const result = await handleInboundMessage(payload);

    res.json({
      ok: true,
      reply: result.reply,
      intent: result.intent
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: "server_error"
    });

  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`EVA Core running on port ${PORT}`);
});

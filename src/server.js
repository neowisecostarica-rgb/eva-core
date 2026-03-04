import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "EVA Core running 🚀",
    version: "1.0.0"
  });
});

// MVP inbound endpoint
app.post("/v1/messages/inbound", async (req, res) => {
  const { api_key, external_user_id, text, channel } = req.body;

  if (!api_key || !external_user_id || !text) {
    return res.status(400).json({
      error: "Missing required fields"
    });
  }

  // Respuesta simulada por ahora (luego conectamos LLM)
  const reply = `Hola 🙌 Recibí tu mensaje: "${text}". Estamos construyendo EVA 🚀`;

  res.json({
    reply,
    stage: "DISCOVERY",
    confidence: 0.80
  });
});

app.listen(PORT, () => {
  console.log(`EVA Core running on port ${PORT}`);
});

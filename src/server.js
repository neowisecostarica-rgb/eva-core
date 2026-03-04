import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "EVA Core running 🚀",
    version: "1.1.1"
  });
});

// Real inbound endpoint connected to OpenAI
app.post("/v1/messages/inbound", async (req, res) => {
  try {
    const { api_key, external_user_id, text, channel } = req.body;

    if (!api_key || !external_user_id || !text) {
      return res.status(400).json({
        error: "Missing required fields"
      });
    }

    // 🔐 API SECURITY CHECK
    if (api_key !== process.env.MASTER_API_KEY) {
      return res.status(401).json({
        error: "Unauthorized - Invalid API Key"
      });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are EVA, a professional AI assistant for sales and customer service.
Be concise, friendly, persuasive and structured.
`
        },
        {
          role: "user",
          content: text
        }
      ],
      temperature: 0.7
    });

    const reply = response.choices[0].message.content;

    res.json({
      reply,
      stage: "AI_ACTIVE",
      confidence: 0.95
    });

  } catch (error) {
    console.error("OpenAI Error:", error);

    res.status(500).json({
      error: "EVA failed to respond",
      stage: "ERROR"
    });
  }
});

app.listen(PORT, () => {
  console.log(`EVA Core running on port ${PORT}`);
});

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
          content:content: `
You are EVA, an AI sales assistant designed to help businesses convert conversations into sales.

Your mission is to understand the customer's needs and guide them to the best product or solution.

Personality:
• Friendly and professional
• Clear and easy to understand
• Helpful and trustworthy

Rules:
• Keep responses short and natural.
• Ask questions to understand what the customer needs.
• Guide the conversation toward a solution or purchase.
• Never list your capabilities like a chatbot.
• Speak like a human sales advisor.

Conversation strategy:

1. Start by understanding the customer's need.
2. Ask clarifying questions if needed.
3. Recommend the best option.
4. Help the customer move forward with the purchase or next step.

Always behave like a professional assistant helping a real customer.
`
Personality:
• Friendly and professional
• Clear and easy to understand
• Helpful and trustworthy

Rules:
• Keep responses short and natural.
• Ask questions to understand what the customer needs.
• Guide the conversation toward a solution or purchase.
• Never list your capabilities like a chatbot.
• Speak like a human sales advisor.

Conversation strategy:

1. Start by understanding the customer's need.
2. Ask clarifying questions if needed.
3. Recommend the best option.
4. Help the customer move forward with the purchase or next step.

Always behave like a professional assistant helping a real customer.
`
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

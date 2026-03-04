import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import pool from "./db.js";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ===============================
   DATABASE INIT
================================ */
(async () => {
  try {

    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        external_user_id TEXT NOT NULL,
        channel TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone TEXT UNIQUE,
        email TEXT,
        instagram TEXT,
        source TEXT,
        status TEXT DEFAULT 'NEW',
        budget TEXT,
        use_case TEXT,
        interest_level TEXT DEFAULT 'LOW',
        intent TEXT,
        score INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID REFERENCES conversations(id),
        role TEXT,
        content TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("DB connected and tables ready");

  } catch (err) {
    console.error("DB connection error:", err);
  }
})();

/* ===============================
   HEALTH CHECK
================================ */
app.get("/", (req, res) => {
  res.json({
    status: "EVA Core running 🚀",
    version: "1.3.0"
  });
});

/* ===============================
   INBOUND MESSAGE
================================ */
app.post("/v1/messages/inbound", async (req, res) => {
  try {

    const { api_key, external_user_id, text, channel } = req.body;

    if (!api_key || !external_user_id || !text) {
      return res.status(400).json({
        error: "Missing required fields"
      });
    }

    if (api_key !== process.env.MASTER_API_KEY) {
      return res.status(401).json({
        error: "Unauthorized - Invalid API Key"
      });
    }

    /* ===============================
       CREATE LEAD IF NOT EXISTS
    ============================== */
    await pool.query(
      `
      INSERT INTO leads (phone, source)
      VALUES ($1,$2)
      ON CONFLICT (phone) DO NOTHING
      `,
      [external_user_id, channel || "unknown"]
    );

    /* ===============================
       FIND OR CREATE CONVERSATION
    ============================== */
    let conversation = await pool.query(
      "SELECT * FROM conversations WHERE external_user_id = $1 LIMIT 1",
      [external_user_id]
    );

    if (conversation.rows.length === 0) {
      conversation = await pool.query(
        "INSERT INTO conversations (external_user_id, channel) VALUES ($1,$2) RETURNING *",
        [external_user_id, channel || "unknown"]
      );
    }

    const conversation_id = conversation.rows[0].id;

    /* ===============================
       SAVE USER MESSAGE
    ============================== */
    await pool.query(
      "INSERT INTO messages (conversation_id, role, content) VALUES ($1,$2,$3)",
      [conversation_id, "user", text]
    );

    /* ===============================
       LOAD HISTORY
    ============================== */
    const history = await pool.query(
      "SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 10",
      [conversation_id]
    );

    const systemPrompt = `
You are EVA, an AI sales assistant designed to help businesses convert conversations into sales.

Your mission is to understand the customer's needs and guide them to the best product or solution.

Personality:
- Friendly
- Professional
- Natural

Rules:
- Keep responses short
- Ask clarifying questions
- Guide toward a solution
`;

    /* ===============================
       AI RESPONSE
    ============================== */
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...history.rows,
        { role: "user", content: text }
      ],
      temperature: 0.7
    });

    const reply = response.choices[0].message.content;

    /* ===============================
       INTENT DETECTION
    ============================== */

    let intent = "INFO";
    let score = 40;

    const msg = text.toLowerCase();

    if (
      msg.includes("precio") ||
      msg.includes("comprar") ||
      msg.includes("cuesta")
    ) {
      intent = "BUY";
      score = 80;
    }

    if (
      msg.includes("hola") ||
      msg.includes("buenas")
    ) {
      intent = "GREETING";
      score = 10;
    }

    if (
      msg.includes("problema") ||
      msg.includes("no funciona")
    ) {
      intent = "SUPPORT";
      score = 30;
    }

    /* ===============================
       UPDATE LEAD
    ============================== */
    await pool.query(
      "UPDATE leads SET intent=$1, score=$2, updated_at=NOW() WHERE phone=$3",
      [intent, score, external_user_id]
    );

    /* ===============================
       SAVE EVA RESPONSE
    ============================== */
    await pool.query(
      "INSERT INTO messages (conversation_id, role, content) VALUES ($1,$2,$3)",
      [conversation_id, "assistant", reply]
    );

    res.json({
      reply,
      intent,
      score,
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

/* ===============================
   SERVER START
================================ */
app.listen(PORT, () => {
  console.log(`EVA Core running on port ${PORT}`);
});

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
        stage TEXT DEFAULT 'NEW',
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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS pipeline_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_phone TEXT NOT NULL,
        from_stage TEXT,
        to_stage TEXT NOT NULL,
        reason TEXT,
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
    version: "1.4.0"
  });
});

/* ===============================
   TEST ENDPOINT
================================ */
app.get("/test", async (req, res) => {
  try {

    const text = req.query.msg || "hola";

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are EVA, a helpful AI sales assistant."
        },
        {
          role: "user",
          content: text
        }
      ]
    });

    res.json({
      question: text,
      reply: response.choices[0].message.content
    });

  } catch (error) {

    res.json({
      error: "EVA test failed"
    });

  }
});

/* ===============================
   INBOUND MESSAGE
================================ */
app.post("/v1/messages/inbound", async (req, res) => {
  try {

    const { api_key, external_user_id, text, channel } = req.body;

    if (!api_key || !external_user_id || !text) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (api_key !== process.env.MASTER_API_KEY) {
      return res.status(401).json({ error: "Unauthorized - Invalid API Key" });
    }

    const leadPhone = external_user_id;
    const leadSource = channel || "unknown";

    /* ===============================
       CREATE LEAD IF NOT EXISTS
    ============================== */
    await pool.query(
      `
      INSERT INTO leads (phone, source)
      VALUES ($1,$2)
      ON CONFLICT (phone) DO NOTHING
      `,
      [leadPhone, leadSource]
    );

    /* ===============================
       FIND OR CREATE CONVERSATION
    ============================== */
    let conversation = await pool.query(
      "SELECT * FROM conversations WHERE external_user_id = $1 LIMIT 1",
      [leadPhone]
    );

    if (conversation.rows.length === 0) {
      conversation = await pool.query(
        "INSERT INTO conversations (external_user_id, channel) VALUES ($1,$2) RETURNING *",
        [leadPhone, leadSource]
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

Rules:
- Keep responses short and natural.
- Ask clarifying questions.
- Guide toward a solution or purchase.
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
       INTENT + SCORE
    ============================== */
    let intent = "INFO";
    let score = 40;

    const msg = text.toLowerCase();

    const isBuy =
      msg.includes("precio") ||
      msg.includes("comprar") ||
      msg.includes("cuesta") ||
      msg.includes("disponible") ||
      msg.includes("apartarlo") ||
      msg.includes("apartar");

    const isGreeting =
      msg.includes("hola") ||
      msg.includes("buenas") ||
      msg.includes("buenos");

    const isSupport =
      msg.includes("problema") ||
      msg.includes("no funciona") ||
      msg.includes("reparar") ||
      msg.includes("arreglar") ||
      msg.includes("diagnóstico") ||
      msg.includes("diagnostico");

    if (isBuy) {
      intent = "BUY";
      score = 80;
    } else if (isGreeting) {
      intent = "GREETING";
      score = 10;
    } else if (isSupport) {
      intent = "SUPPORT";
      score = 30;
    }

    /* ===============================
       PIPELINE STAGE AUTO
    ============================== */
    // stages: NEW → CONTACTED → QUALIFIED → PROPOSAL → CLOSED
    const leadRow = await pool.query(
      "SELECT stage FROM leads WHERE phone=$1 LIMIT 1",
      [leadPhone]
    );
    const currentStage = leadRow.rows[0]?.stage || "NEW";

    let newStage = currentStage;
    let reason = null;

    // si ya habló, pasa a CONTACTED
    if (currentStage === "NEW") {
      newStage = "CONTACTED";
      reason = "first_message";
    }

    // intención de compra o score alto => QUALIFIED
    if (intent === "BUY" && (currentStage === "NEW" || currentStage === "CONTACTED")) {
      newStage = "QUALIFIED";
      reason = "buy_intent";
    }

    // si pregunta precio/apartar => PROPOSAL (ya está listo para oferta)
    if (isBuy && (msg.includes("precio") || msg.includes("apart") || msg.includes("pago") || msg.includes("sinpe"))) {
      newStage = "PROPOSAL";
      reason = "price_or_reserve";
    }

    /* ===============================
       UPDATE LEAD + PIPELINE EVENT
    ============================== */
    await pool.query(
      "UPDATE leads SET intent=$1, score=$2, stage=$3, updated_at=NOW() WHERE phone=$4",
      [intent, score, newStage, leadPhone]
    );

    if (newStage !== currentStage) {
      await pool.query(
        `
        INSERT INTO pipeline_events (lead_phone, from_stage, to_stage, reason)
        VALUES ($1,$2,$3,$4)
        `,
        [leadPhone, currentStage, newStage, reason]
      );
    }

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
      stage: newStage,
      stage_prev: currentStage,
      stage_reason: reason,
      ai_stage: "AI_ACTIVE",
      confidence: 0.95
    });

  } catch (error) {
    console.error("EVA Error:", error);
    res.status(500).json({ error: "EVA failed to respond", stage: "ERROR" });
  }
});

/* ===============================
   SERVER START
================================ */
app.listen(PORT, () => {
  console.log(`EVA Core running on port ${PORT}`);
});

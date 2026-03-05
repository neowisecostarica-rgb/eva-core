// server.js (EVA Core - Fixed + Human Control)

import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import pkg from "pg";
import crypto from "crypto";

dotenv.config();

const { Pool } = pkg;

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true"
    ? { rejectUnauthorized: false }
    : false
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function normalizePhone(id){
  return String(id || "").trim();
}

function makeApiKey(){
  return "eva_" + crypto.randomBytes(20).toString("hex");
}

/* ----------------------------- ORG AUTH ----------------------------- */

async function getOrgByApiKey(apiKey){

  const r = await pool.query(
    `SELECT * FROM organizations
     WHERE api_key=$1 AND status='ACTIVE'`,
    [apiKey]
  );

  return r.rows[0] || null;

}

/* ----------------------------- HEALTH ----------------------------- */

app.get("/", (req,res)=>{
  res.json({
    status:"EVA Core running 🚀",
    version:"5.0"
  });
});

/* ----------------------------- EVA INBOUND ----------------------------- */

app.post("/v1/messages/inbound", async (req,res)=>{

  try{

    const { api_key, external_user_id, text, channel } = req.body;

    if(!api_key || !external_user_id || !text){
      return res.status(400).json({
        error:"Missing fields"
      });
    }

    const org = await getOrgByApiKey(api_key);

    if(!org){
      return res.status(401).json({
        error:"Invalid API key"
      });
    }

    const phone = normalizePhone(external_user_id);

    let conv = await pool.query(
      `SELECT * FROM conversations
       WHERE organization_id=$1
       AND external_user_id=$2`,
      [org.id, phone]
    );

    let conversationId;
    let controlMode = "AI_ACTIVE";

    if(conv.rows.length === 0){

      const newConv = await pool.query(
        `INSERT INTO conversations
        (organization_id, external_user_id, channel)
        VALUES ($1,$2,$3)
        RETURNING *`,
        [org.id, phone, channel || "unknown"]
      );

      conversationId = newConv.rows[0].id;

    }else{

      conversationId = conv.rows[0].id;
      controlMode = conv.rows[0].control_mode || "AI_ACTIVE";

    }

    /* ---------------- HUMAN CONTROL ---------------- */

    if(controlMode === "HUMAN_ACTIVE"){

      return res.json({
        paused:true,
        reason:"Human takeover active"
      });

    }

    /* ---------------- SAVE USER MESSAGE ---------------- */

    await pool.query(
      `INSERT INTO messages
      (organization_id,conversation_id,role,content)
      VALUES ($1,$2,$3,$4)`,
      [org.id,conversationId,"user",text]
    );

    /* ---------------- AI RESPONSE ---------------- */

    const ai = await openai.chat.completions.create({
      model:"gpt-4o-mini",
      messages:[
        {
          role:"system",
          content:"You are EVA, a professional sales assistant."
        },
        {
          role:"user",
          content:text
        }
      ]
    });

    const reply = ai.choices[0].message.content;

    /* ---------------- SAVE AI MESSAGE ---------------- */

    await pool.query(
      `INSERT INTO messages
      (organization_id,conversation_id,role,content)
      VALUES ($1,$2,$3,$4)`,
      [org.id,conversationId,"assistant",reply]
    );

    res.json({
      reply,
      conversation_id:conversationId
    });

  }catch(err){

    console.error(err);

    res.status(500).json({
      error:"Server error"
    });

  }

});

/* ----------------------------- HUMAN TAKEOVER ----------------------------- */

app.post("/v1/conversations/:id/takeover", async (req,res)=>{

  try{

    const apiKey = req.headers.authorization?.replace("Bearer ","");

    const org = await getOrgByApiKey(apiKey);

    if(!org){
      return res.status(401).json({error:"Invalid key"});
    }

    const { id } = req.params;

    await pool.query(
      `UPDATE conversations
       SET control_mode='HUMAN_ACTIVE'
       WHERE id=$1 AND organization_id=$2`,
      [id,org.id]
    );

    res.json({
      status:"HUMAN_ACTIVE"
    });

  }catch(e){

    res.status(500).json({
      error:"Server error"
    });

  }

});

/* ----------------------------- RETURN TO EVA ----------------------------- */

app.post("/v1/conversations/:id/ai", async (req,res)=>{

  try{

    const apiKey = req.headers.authorization?.replace("Bearer ","");

    const org = await getOrgByApiKey(apiKey);

    if(!org){
      return res.status(401).json({error:"Invalid key"});
    }

    const { id } = req.params;

    await pool.query(
      `UPDATE conversations
       SET control_mode='AI_ACTIVE'
       WHERE id=$1 AND organization_id=$2`,
      [id,org.id]
    );

    res.json({
      status:"AI_ACTIVE"
    });

  }catch(e){

    res.status(500).json({
      error:"Server error"
    });

  }

});

/* ----------------------------- WHATSAPP WEBHOOK ----------------------------- */

app.post("/v1/webhooks/whatsapp", async (req,res)=>{

  try{

    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    const message = value?.messages?.[0];

    if(!message){
      return res.sendStatus(200);
    }

    const from = message.from;
    const text = message.text?.body;

    const response = await fetch(
      `${process.env.EVA_BASE_URL}/v1/messages/inbound`,
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          api_key:process.env.EVA_DEFAULT_API_KEY,
          external_user_id:from,
          text,
          channel:"whatsapp"
        })
      }
    );

    const eva = await response.json();

    if(!eva.reply){
      return res.sendStatus(200);
    }

    await fetch(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method:"POST",
        headers:{
          Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          messaging_product:"whatsapp",
          to:from,
          text:{body:eva.reply}
        })
      }
    );

    res.sendStatus(200);

  }catch(err){

    console.error(err);
    res.sendStatus(500);

  }

});

/* ----------------------------- START ----------------------------- */

app.listen(PORT,()=>{
  console.log("EVA running on port",PORT);
});

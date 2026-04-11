/*
====================================================
EVA CORE — SALES BRAIN (BLOCK 4 — EXECUTION ENABLED)
====================================================
*/

import OpenAI from "openai";

import {
  findOrCreateLead,
  findOrCreateConversation,
  saveMessage,
} from "./db.js";

import { scheduleFollowup } from "./followupEngine.js";

import { detectIntent } from "./brain/engines/intentEngine.js";
import {
  decideStrategy,
  normalizeIntent,
} from "./brain/engines/strategyEngine.js";

import { buildContext } from "./contextBuilder.js";

import { searchCatalogSmart } from "./brain/commerce/catalogEngine.js";
import { enhanceProductReply } from "./brain/commerce/productAdvisorEngine.js";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/*
====================================================
UTILS
====================================================
*/

function safe(v) {
  return String(v || "").trim();
}

/*
====================================================
AI
====================================================
*/

async function runAI(context) {
  if (!openai) return null;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: `
Eres ${context.assistant.name}.

Intent: ${context.intent}
Stage: ${context.stage}
Strategy: ${context.strategy}

Data:
${JSON.stringify(context.known_data)}

Mensaje:
${context.user_message}

Responde JSON:
{ "reply": "mensaje", "confidence": 0.8 }
`,
        },
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content;

    if (!raw) return null;

    const parsed = JSON.parse(raw);

    return parsed.reply || null;
  } catch (e) {
    console.error("AI ERROR", e);
    return null;
  }
}

/*
====================================================
EXECUTION ENGINE 🔥
====================================================
*/

async function executeStrategy(context) {
  const { strategy, intent, known_data } = context;

  let products = [];

  /*
  ============================
  PRODUCT SEARCH
  ============================
  */

  if (strategy === "RECOMMEND" || strategy === "CLOSE") {
    try {
      products = await searchCatalogSmart({
        organization_id: context.organization.id,
        query: context.user_message,
      });
    } catch (e) {
      console.error("catalog error", e);
    }
  }

  /*
  ============================
  AI BASE
  ============================
  */

  let reply = await runAI(context);

  /*
  ============================
  PRODUCT ENHANCEMENT
  ============================
  */

  reply = enhanceProductReply({
    reply,
    intent,
    catalogMatches: products,
    data: context.sales_context,
  });

  /*
  ============================
  FALLBACK
  ============================
  */

  if (!reply) {
    if (strategy === "QUALIFY") {
      return "¿La necesita para estudio o trabajo?";
    }

    if (strategy === "CLOSE") {
      return "¿Prefiere envío o retiro?";
    }

    return "¿En qué le puedo ayudar?";
  }

  return reply;
}

/*
====================================================
MAIN
====================================================
*/

export async function handleInbound(payload) {
  try {
    const organization_id = safe(payload.organization_id);
    const phone = safe(payload.phone);
    const text = safe(payload.text);
    const channel = safe(payload.channel || "whatsapp");

    const lead = await findOrCreateLead({ organization_id, phone });

    const conversation = await findOrCreateConversation({
      organization_id,
      phone,
      channel,
    });

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "user",
      text,
    });

    /*
    =====================
    INTENT
    =====================
    */

    const rawIntent = detectIntent(text);
    const intent = normalizeIntent(rawIntent);

    /*
    =====================
    CONTEXT
    =====================
    */

    const context = await buildContext({
      organization_id,
      phone,
      text,
      intent,
    });

    /*
    =====================
    STRATEGY
    =====================
    */

    const decision = decideStrategy({
      intent: context.intent,
      stage: context.stage,
      known_data: context.known_data,
    });

    context.strategy = decision.strategy;

    console.log("🧠 EXECUTION:", context);

    /*
    =====================
    EXECUTION 🔥
    =====================
    */

    const reply = await executeStrategy(context);

    /*
    =====================
    SAVE
    =====================
    */

    await saveMessage({
      organization_id,
      conversation_id: conversation.id,
      role: "assistant",
      text: reply,
    });

    /*
    =====================
    FOLLOWUP
    =====================
    */

    if (
      intent === "BUY" ||
      intent === "INFO" ||
      intent === "SERVICE"
    ) {
      await scheduleFollowup({
        organization_id,
        lead_id: lead?.id,
        phone,
        conversation_id: conversation.id,
      });
    }

    return {
      reply: { text: reply },
    };
  } catch (err) {
    console.error("ERROR", err);

    return {
      reply: {
        text: "¿Me puede repetir la consulta?",
      },
    };
  }
}

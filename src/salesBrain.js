/*
====================================================
EVA SALES BRAIN — V3 (AI ACTIVE + SAFE FALLBACK)
====================================================
*/

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function normalize(text = "") {
  return String(text).toLowerCase().trim();
}

/* ======================================
   CONTEXT BUILDER
====================================== */

function buildContext(payload) {
  return {
    phone: payload.phone,
    organization_id: payload.organization_id || null,
    channel: payload.channel || "whatsapp",
    message: payload.text || "",
    message_id: payload.message_id || null
  };
}

/* ======================================
   INTENT DETECTION (GUARDRAIL)
====================================== */

function detectIntent(text = "") {
  const t = normalize(text);

  if (!t) return "UNKNOWN";

  if (t.includes("hola") || t.includes("buenas")) return "GREETING";

  if (t.includes("problema") || t.includes("no funciona"))
    return "SUPPORT";

  if (
    t.includes("precio") ||
    t.includes("cuanto") ||
    t.includes("computadora") ||
    t.includes("laptop")
  )
    return "BUY";

  return "UNKNOWN";
}

/* ======================================
   PROMPT BUILDER (CORE AI)
====================================== */

function buildPrompt(context) {
  return `
Eres Eva, asesora comercial de Compu Store Costa Rica.

OBJETIVO:
Convertir conversaciones en ventas.

TONO:
- Profesional pero cercana
- Natural (no robot)
- Máximo 1 emoji por mensaje
- No usar lenguaje técnico complejo

REGLAS:
- No explicar cómo reparar equipos
- Siempre guiar a una acción (comprar, ver fotos, visitar)
- Respuestas cortas (máximo 4-5 líneas)
- Sonar humana, no como bot

CONTEXTO CLIENTE:
Mensaje: "${context.message}"

INSTRUCCIÓN:
Responde como una asesora real buscando avanzar la venta.
`;
}

/* ======================================
   AI ENGINE
====================================== */

async function tryAIResponse(context) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.log("⚠️ OPENAI_API_KEY missing → fallback");
      return null;
    }

    const prompt = buildPrompt(context);

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: "Eres una asesora de ventas experta."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 150
    });

    const text = completion.choices?.[0]?.message?.content;

    if (!text) return null;

    return text.trim();
  } catch (error) {
    console.error("❌ AI ERROR:", error.message);
    return null;
  }
}

/* ======================================
   FALLBACK ENGINE (SAFE)
====================================== */

function buildSalesReply(intent, context) {
  const t = normalize(context.message);

  if (intent === "GREETING") {
    return "Hola 😊 con gusto te ayudo.\n\n¿Buscás laptop para estudio, trabajo o algo más específico?";
  }

  if (intent === "BUY") {
    return "Claro 😊\n\n¿La necesitás para estudio, trabajo o algo más exigente?";
  }

  if (intent === "SUPPORT") {
    return "Claro 👍 contame qué problema presenta el equipo y te orientamos.";
  }

  if (t.includes("laptop") || t.includes("computadora")) {
    return "Perfecto 👍 ¿Para qué uso la necesitás?";
  }

  return "Claro 😊 contame qué estás buscando y te ayudo 👍";
}

/* ======================================
   MAIN HANDLER
====================================== */

export async function handleInboundMessage(payload) {
  console.log("📩 INBOUND:", payload);

  const context = buildContext(payload);

  const intent = detectIntent(context.message);
  console.log("🧠 INTENT:", intent);

  // 🔥 1. TRY AI FIRST
  let reply = await tryAIResponse(context);

  // 🛟 2. FALLBACK
  if (!reply) {
    console.log("⚠️ FALLBACK ACTIVATED");
    reply = buildSalesReply(intent, context);
  }

  const result = {
    reply,
    media: []
  };

  console.log("🧠 FINAL RESPONSE:", result);

  return result;
}

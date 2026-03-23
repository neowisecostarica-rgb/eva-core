/*
====================================================
EVA SALES BRAIN — V4 (AI + BUSINESS KNOWLEDGE FIXED)
====================================================
*/

import OpenAI from "openai";

/* ======================================
   EVA CONFIG (TEMP — FUTURE DB)
====================================== */

const EVA_CONFIG = {
  business_name: "Compu Store Costa Rica",
  assistant_name: "Eva",
  tone: "profesional cercano",
  primary_goal: "cerrar ventas",
  rules: [
    "no explicar cómo reparar equipos",
    "siempre guiar a una acción",
    "respuestas cortas",
    "máximo 1 emoji"
  ]
};

/* ======================================
   BUSINESS KNOWLEDGE (TEMP — FUTURE DB)
====================================== */

const BUSINESS_KNOWLEDGE = {
  services: {
    printer_maintenance: {
      keywords: ["impresora", "mantenimiento", "tinta", "epson", "hp"],
      price_range: "₡20.000 – ₡30.000",
      description: "mantenimiento completo con limpieza interna y revisión",
      action: "agendar revisión o traer equipo"
    }
  },

  products: {
    laptops: {
      keywords: ["laptop", "computadora", "portatil"],
      examples: [
        {
          name: "Lenovo ThinkPad 11e",
          price: "₡125.000",
          use: "estudio",
          highlights: ["resistente", "rápida", "ideal estudiantes"]
        }
      ]
    }
  }
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ======================================
   HELPERS
====================================== */

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

  // 🔥 NUEVO
  if (
    t.includes("pago") ||
    t.includes("sinpe") ||
    t.includes("deposito") ||
    t.includes("transferencia")
  )
    return "PAYMENT";

  if (
    t.includes("datos") ||
    t.includes("cuentas") ||
    t.includes("numero")
  )
    return "PAYMENT_INFO";

  return "UNKNOWN";
}

/* ======================================
   BUSINESS CONTEXT DETECTOR
====================================== */

function detectBusinessContext(message) {
  const t = normalize(message);

  // SERVICES
  for (const key in BUSINESS_KNOWLEDGE.services) {
    const service = BUSINESS_KNOWLEDGE.services[key];

    if (service.keywords.some(k => t.includes(k))) {
      return { type: "service", data: service };
    }
  }

  // PRODUCTS
  for (const key in BUSINESS_KNOWLEDGE.products) {
    const product = BUSINESS_KNOWLEDGE.products[key];

    if (product.keywords.some(k => t.includes(k))) {
      return { type: "product", data: product };
    }
  }

  return null;
}

/* ======================================
   PROMPT BUILDER (AI CORE)
====================================== */

function buildPrompt(context, config) {
  const businessContext = detectBusinessContext(context.message);

  let knowledgeSection = "";

  if (businessContext?.type === "service") {
    const s = businessContext.data;

    knowledgeSection = `
SERVICIO DETECTADO:
- Precio estimado: ${s.price_range}
- Detalle: ${s.description}
- Acción: ${s.action}
`;
  }

  if (businessContext?.type === "product") {
    const p = businessContext.data;

    knowledgeSection = `
PRODUCTOS DISPONIBLES:
${p.examples.map(e => `
- ${e.name}
  Precio: ${e.price}
  Ideal para: ${e.use}
  Beneficios: ${e.highlights.join(", ")}
`).join("\n")}
`;
  }

  return `
Eres ${config.assistant_name}, asesora comercial de ${config.business_name}.

OBJETIVO:
${config.primary_goal}

TONO:
${config.tone}

REGLAS:
${config.rules.map(r => `- ${r}`).join("\n")}

${knowledgeSection}

CONTEXTO CLIENTE:
Mensaje: "${context.message}"

INSTRUCCIÓN:
Responde como una asesora real.
Si hay precio, menciónalo naturalmente.
Siempre guía a una acción.
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

    const prompt = buildPrompt(context, EVA_CONFIG);

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

if (intent === "PAYMENT") {
  return `Perfecto 👍

Podés realizar el pago por SINPE Móvil al 7038-2476.

A nombre de Compu Store Costa Rica.

Cuando lo hagás, me pasás el comprobante y te confirmo de una 😊`;
}

if (intent === "PAYMENT_INFO") {
  return `Claro 👍

SINPE Móvil: 7038-2476  
A nombre de Compu Store Costa Rica  

Solo indicá el producto en la descripción.

Cuando hagás el pago me enviás el comprobante y listo 😊`;
}
/* ======================================
   MAIN HANDLER
====================================== */

export async function handleInboundMessage(payload) {
  console.log("📩 INBOUND:", payload);

  const context = buildContext(payload);

  const intent = detectIntent(context.message);
  console.log("🧠 INTENT:", intent);

  // 🔥 AI FIRST
  let reply = await tryAIResponse(context);

  // 🛟 FALLBACK
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

/*
====================================================
EVA SALES BRAIN — V5 (AI + KNOWLEDGE + MEMORY FIX)
====================================================
*/

let openai = null;

async function getOpenAI() {
  if (openai) return openai;

  try {
    const OpenAI = (await import("openai")).default;

    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    return openai;
  } catch (err) {
    console.error("❌ OpenAI init error:", err.message);
    return null;
  }
}

/* ======================================
   EVA CONFIG
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
   MEMORY STORE (RAM)
====================================== */

const conversationMemory = new Map();

function getMemory(phone) {
  return conversationMemory.get(phone) || {};
}

function setMemory(phone, data) {
  const current = conversationMemory.get(phone) || {};
  conversationMemory.set(phone, { ...current, ...data });
}

/* ======================================
   BUSINESS KNOWLEDGE
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
   INTENT DETECTION
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

  if (
    t.includes("pago") ||
    t.includes("sinpe") ||
    t.includes("deposito") ||
    t.includes("transferencia")
  )
    return "PAYMENT";

  if (
    t.includes("datos") ||
    t.includes("cuenta") ||
    t.includes("numero")
  )
    return "PAYMENT_INFO";

  return "UNKNOWN";
}

/* ======================================
   BUSINESS CONTEXT
====================================== */

function detectBusinessContext(message) {
  const t = normalize(message);

  for (const key in BUSINESS_KNOWLEDGE.services) {
    const s = BUSINESS_KNOWLEDGE.services[key];
    if (s.keywords.some(k => t.includes(k))) {
      return { type: "service", data: s };
    }
  }

  for (const key in BUSINESS_KNOWLEDGE.products) {
    const p = BUSINESS_KNOWLEDGE.products[key];
    if (p.keywords.some(k => t.includes(k))) {
      return { type: "product", data: p };
    }
  }

  return null;
}

/* ======================================
   PROMPT BUILDER
====================================== */

function buildPrompt(context, config) {
  const businessContext = detectBusinessContext(context.message);

  let knowledge = "";

  if (businessContext?.type === "service") {
    const s = businessContext.data;

    knowledge = `
SERVICIO:
Precio: ${s.price_range}
Detalle: ${s.description}
Acción: ${s.action}
`;
  }

  if (businessContext?.type === "product") {
    const p = businessContext.data;

    knowledge = `
PRODUCTOS:
${p.examples.map(e => `
- ${e.name} (${e.price})
`).join("")}
`;
  }

  return `
Eres ${config.assistant_name}, asesora comercial de ${config.business_name}.

OBJETIVO: ${config.primary_goal}
TONO: ${config.tone}

REGLAS:
${config.rules.map(r => `- ${r}`).join("\n")}

${knowledge}

CLIENTE:
"${context.message}"

Responde como humana y guía a cierre.
`;
}

/* ======================================
   AI ENGINE
====================================== */

async function tryAIResponse(context) {
  return null;
}
  try {
    if (!process.env.OPENAI_API_KEY) return null;
const client = await getOpenAI();
if (!client) return null;

const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: "Eres experta en ventas." },
        { role: "user", content: buildPrompt(context, EVA_CONFIG) }
      ],
      temperature: 0.7,
      max_tokens: 150
    });

    return completion.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

/* ======================================
   FALLBACK
====================================== */

function buildSalesReply(intent, context) {
  const t = normalize(context.message);

  if (intent === "PAYMENT") {
    return `Perfecto 👍

Podés realizar el pago por SINPE Móvil al 7038-2476.

A nombre de Compu Store Costa Rica.

Cuando lo hagás me pasás el comprobante 😊`;
  }

  if (intent === "PAYMENT_INFO") {
    return `Claro 👍

SINPE: 7038-2476  
A nombre de Compu Store Costa Rica  

Indicá el producto en la descripción.

Luego me enviás el comprobante 😊`;
  }

  if (intent === "GREETING") {
    return "Hola 😊 ¿Buscás laptop o algún servicio?";
  }

  if (intent === "BUY") {
    return "Claro 😊 ¿Para qué uso la necesitás?";
  }

  if (intent === "SUPPORT") {
    return "Claro 👍 contame qué problema presenta el equipo.";
  }

  if (t.includes("laptop")) {
    return "Perfecto 👍 ¿para estudio o trabajo?";
  }

  return "Claro 😊 contame qué estás buscando 👍";
}

/* ======================================
   MAIN
====================================== */

export async function handleInboundMessage(payload) {
  console.log("📩 INBOUND:", payload);

  const context = buildContext(payload);

  // 🧠 MEMORY
  const memory = getMemory(context.phone);

  const intent = detectIntent(context.message);

  if (intent === "PAYMENT" || intent === "PAYMENT_INFO") {
    setMemory(context.phone, { stage: intent });
  }

  const currentMemory = getMemory(context.phone);

  // 🔥 PRIORIDAD: MEMORY
  if (currentMemory.stage === "PAYMENT") {
    return {
      reply: `Perfecto 👍

Podés pagar por SINPE al 7038-2476.

Cuando lo hagás me pasás el comprobante 😊`,
      media: []
    };
  }

  if (currentMemory.stage === "PAYMENT_INFO") {
    return {
      reply: `Claro 👍

SINPE: 7038-2476  
A nombre de Compu Store Costa Rica  

Me enviás el comprobante cuando esté listo 😊`,
      media: []
    };
  }

  // 🔥 AI
  let reply = await tryAIResponse(context);

  // 🛟 FALLBACK
  if (!reply) {
    reply = buildSalesReply(intent, context);
  }

  return {
    reply,
    media: []
  };
}

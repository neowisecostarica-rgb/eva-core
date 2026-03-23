/*
====================================================
EVA SALES BRAIN — AI FIRST (STABLE + SAFE)
====================================================
*/

/* ======================================
   OPENAI SAFE LOAD
====================================== */

let openai = null;

async function getOpenAI() {
  try {
    if (openai) return openai;

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
   EVA CONFIG (BASE — luego será dinámico)
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
    "máximo 1 emoji",
    "tono humano y natural",
    "no sonar como bot"
  ]
};

/* ======================================
   MEMORY (RAM)
====================================== */

const memory = new Map();

function getMemory(phone) {
  return memory.get(phone) || {};
}

function setMemory(phone, data) {
  const current = memory.get(phone) || {};
  memory.set(phone, { ...current, ...data });
}

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
    message: payload.text || "",
    channel: payload.channel || "whatsapp"
  };
}

/* ======================================
   INTENT (SOLO APOYO, NO NÚCLEO)
====================================== */

function detectIntent(text = "") {
  const t = normalize(text);

  if (t.includes("hola")) return "GREETING";
  if (t.includes("precio") || t.includes("laptop")) return "BUY";
  if (t.includes("problema")) return "SUPPORT";

  return "UNKNOWN";
}

/* ======================================
   PROMPT ENGINE (🔥 CLAVE DEL SISTEMA)
====================================== */

function buildPrompt(context, config) {
  return `
Eres ${config.assistant_name}, asesora comercial experta de ${config.business_name}.

Tu objetivo es: ${config.primary_goal}

Tono: ${config.tone}

Reglas:
${config.rules.map(r => `- ${r}`).join("\n")}

IMPORTANTE:
- No des respuestas largas
- Sé natural y humana
- Habla como si estuvieras en WhatsApp
- Siempre guía la conversación hacia una acción (compra, visita, consulta)

Cliente dice:
"${context.message}"

Responde como ${config.assistant_name}.
`;
}

/* ======================================
   AI ENGINE (CORE)
====================================== */

async function generateAIResponse(context) {
  try {
    if (!process.env.OPENAI_API_KEY) return null;

    const client = await getOpenAI();
    if (!client) return null;

    const prompt = buildPrompt(context, EVA_CONFIG);

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: "Eres una asesora de ventas experta en cerrar clientes."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 120
    });

    return completion.choices?.[0]?.message?.content?.trim() || null;

  } catch (err) {
    console.error("❌ AI ERROR:", err.message);
    return null;
  }
}

/* ======================================
   FALLBACK (SOLO SI TODO FALLA)
====================================== */

function fallbackReply(context) {
  return "Hola 😊 contame qué estás buscando y con gusto te ayudo 🙌";
}

/* ======================================
   MAIN
====================================== */

export async function handleInboundMessage(payload) {
  console.log("📩 INBOUND:", payload);

  const context = buildContext(payload);

  // 🧠 memoria mínima
  const intent = detectIntent(context.message);

  if (intent === "BUY") {
    setMemory(context.phone, { interest: "laptop" });
  }

  // 🔥 AI PRINCIPAL
  let reply = await generateAIResponse(context);

  // 🛟 fallback de seguridad
  if (!reply) {
    reply = fallbackReply(context);
  }

  return {
    reply,
    media: []
  };
}

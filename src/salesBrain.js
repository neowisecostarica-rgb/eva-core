/*
====================================================
EVA SALES BRAIN — AI FIRST + MEMORY ENGINE P0
====================================================
*/

/* ======================================
   OPENAI SAFE LOAD
====================================== */

let openaiClient = null;

async function getOpenAI() {
  try {
    if (openaiClient) return openaiClient;

    const OpenAI = (await import("openai")).default;

    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    return openaiClient;
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
    "siempre guiar a una acción concreta",
    "respuestas cortas",
    "máximo 1 emoji",
    "tono humano y natural",
    "no sonar como bot",
    "si el cliente ya dijo el tema, no volver a preguntar desde cero",
    "si el contexto es mantenimiento, no desviar a compra de producto",
    "si el cliente pide precio, responder sobre el tema actual de la conversación"
  ]
};

/* ======================================
   MEMORY STORE (RAM)
====================================== */

const conversationMemory = new Map();

function getMemory(phone) {
  return conversationMemory.get(phone) || {
    phone,
    topic: null,
    category: null,
    product_type: null,
    model: null,
    brand: null,
    last_intent: null,
    stage: "DISCOVERY",
    last_user_message: null,
    last_ai_reply: null,
    turns: 0
  };
}

function setMemory(phone, patch) {
  const current = getMemory(phone);

  conversationMemory.set(phone, {
    ...current,
    ...patch
  });

  return conversationMemory.get(phone);
}

/* ======================================
   HELPERS
====================================== */

function normalize(text = "") {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function includesAny(text, keywords = []) {
  return keywords.some(k => text.includes(k));
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

  if (includesAny(t, ["hola", "buenas", "buenos dias", "buenas tardes", "buenas noches"])) {
    return "GREETING";
  }

  if (includesAny(t, ["precio", "cuanto", "cuánto", "vale", "costo", "coste"])) {
    return "PRICE_CHECK";
  }

  if (includesAny(t, ["mantenimiento", "reparar", "reparacion", "revisión", "revision", "servicio tecnico", "servicio técnico"])) {
    return "SUPPORT";
  }

  if (includesAny(t, ["laptop", "computadora", "portatil", "portátil", "pc"])) {
    return "BUY";
  }

  if (includesAny(t, ["pago", "sinpe", "deposito", "depósito", "transferencia"])) {
    return "PAYMENT";
  }

  if (includesAny(t, ["datos", "cuenta", "numero", "número", "iban"])) {
    return "PAYMENT_INFO";
  }

  if (includesAny(t, ["planes", "plan"])) {
    return "INFO";
  }

  return "UNKNOWN";
}

/* ======================================
   ENTITY EXTRACTION
====================================== */

function extractEntities(text = "") {
  const t = normalize(text);

  let category = null;
  let product_type = null;
  let topic = null;
  let brand = null;
  let model = null;

  if (includesAny(t, ["impresora", "epson", "hp", "canon", "tmu", "tm-u", "lx-350", "l3110", "l3150"])) {
    category = "printer";
    product_type = "printer";
  }

  if (includesAny(t, ["mantenimiento", "reparar", "reparacion", "revision", "servicio tecnico"])) {
    topic = "maintenance";
  }

  if (includesAny(t, ["laptop", "computadora", "portatil", "pc"])) {
    category = category || "computer";
    product_type = "laptop";
    topic = topic || "purchase";
  }

  if (t.includes("epson")) brand = "Epson";
  if (t.includes("hp")) brand = "HP";
  if (t.includes("canon")) brand = "Canon";

  const knownModels = [
    { match: "tmu 220", value: "TMU 220" },
    { match: "tmu220", value: "TMU 220" },
    { match: "tm-u 220", value: "TM-U 220" },
    { match: "tm-u220", value: "TM-U 220" },
    { match: "lx-350", value: "LX-350" },
    { match: "l3110", value: "L3110" },
    { match: "l3150", value: "L3150" }
  ];

  for (const item of knownModels) {
    if (t.includes(item.match)) {
      model = item.value;
      break;
    }
  }

  return {
    category,
    product_type,
    topic,
    brand,
    model
  };
}

/* ======================================
   MEMORY UPDATE
====================================== */

function updateConversationMemory(context) {
  const current = getMemory(context.phone);
  const intent = detectIntent(context.message);
  const entities = extractEntities(context.message);

  const next = {
    last_intent: intent !== "UNKNOWN" ? intent : current.last_intent,
    category: entities.category || current.category,
    product_type: entities.product_type || current.product_type,
    topic: entities.topic || current.topic,
    brand: entities.brand || current.brand,
    model: entities.model || current.model,
    last_user_message: context.message,
    turns: (current.turns || 0) + 1
  };

  if (intent === "PRICE_CHECK") {
    next.stage = "PRICE";
  } else if (intent === "SUPPORT") {
    next.stage = "SUPPORT";
  } else if (intent === "BUY") {
    next.stage = "OFFER";
  } else {
    next.stage = current.stage || "DISCOVERY";
  }

  return setMemory(context.phone, next);
}

/* ======================================
   MEMORY SUMMARY
====================================== */

function buildMemorySummary(memory) {
  const lines = [];

  if (memory.topic) lines.push(`- Tema actual: ${memory.topic}`);
  if (memory.category) lines.push(`- Categoría: ${memory.category}`);
  if (memory.product_type) lines.push(`- Tipo de producto/equipo: ${memory.product_type}`);
  if (memory.brand) lines.push(`- Marca detectada: ${memory.brand}`);
  if (memory.model) lines.push(`- Modelo detectado: ${memory.model}`);
  if (memory.last_intent) lines.push(`- Última intención detectada: ${memory.last_intent}`);
  if (memory.stage) lines.push(`- Etapa actual: ${memory.stage}`);
  if (memory.last_user_message) lines.push(`- Último mensaje del cliente: "${memory.last_user_message}"`);

  return lines.length ? lines.join("\n") : "- Sin memoria previa relevante";
}

/* ======================================
   PROMPT ENGINE
====================================== */

function buildPrompt(context, config, memory) {
  const memorySummary = buildMemorySummary(memory);

  return `
Eres ${config.assistant_name}, asesora comercial experta de ${config.business_name}.

OBJETIVO:
${config.primary_goal}

TONO:
${config.tone}

REGLAS:
${config.rules.map(r => `- ${r}`).join("\n")}

MEMORIA DE LA CONVERSACIÓN:
${memorySummary}

INSTRUCCIONES IMPORTANTES:
- Responde como asesora humana por WhatsApp.
- No reinicies la conversación si ya existe contexto previo.
- Si el cliente pregunta por precio, responde según el tema actual.
- Si el contexto actual es mantenimiento de impresora, mantente en ese flujo.
- Si detectas modelo o marca, aprovéchalo en la respuesta.
- No inventes productos ni cambies de categoría sin razón.
- Siempre termina guiando a una acción útil.
- Mantén la respuesta breve y natural.

MENSAJE ACTUAL DEL CLIENTE:
"${context.message}"

Devuelve solo el texto final que le enviarías al cliente.
`;
}

/* ======================================
   AI ENGINE
====================================== */

async function generateAIResponse(context, memory) {
  try {
    if (!process.env.OPENAI_API_KEY) return null;

    const client = await getOpenAI();
    if (!client) return null;

    const prompt = buildPrompt(context, EVA_CONFIG, memory);

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: "Eres una asesora de ventas experta en WhatsApp. Responde breve, humana y con continuidad conversacional."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.5,
      max_tokens: 160
    });

    const reply = completion.choices?.[0]?.message?.content?.trim() || null;
    return reply;
  } catch (err) {
    console.error("❌ AI ERROR:", err.message);
    return null;
  }
}

/* ======================================
   FALLBACK
====================================== */

function buildFallbackReply(context, memory) {
  const intent = detectIntent(context.message);
  const t = normalize(context.message);

  if (intent === "PAYMENT") {
    return `Perfecto 👍

Podés realizar el pago por SINPE Móvil al 7038-2476.

Cuando lo hagás me pasás el comprobante.`;
  }

  if (intent === "PAYMENT_INFO") {
    return `Claro 👍

SINPE: 7038-2476  
A nombre de Compu Store Costa Rica.

Si querés, también te comparto transferencia o IBAN.`;
  }

  if (memory.topic === "maintenance" && memory.category === "printer" && intent === "PRICE_CHECK") {
    if (memory.model && memory.brand) {
      return `Claro 👍 Para mantenimiento de la ${memory.brand} ${memory.model}, el servicio normalmente ronda entre ₡20.000 y ₡30.000 según el estado del equipo. Si querés, te indico cómo agendar la revisión.`;
    }

    return `Claro 👍 El mantenimiento de impresoras normalmente ronda entre ₡20.000 y ₡30.000 según el tipo de equipo y el estado. Si querés, te ayudo a coordinar la revisión.`;
  }

  if (memory.topic === "maintenance" && memory.category === "printer") {
    if (memory.model && memory.brand) {
      return `Perfecto 👍 Ya vi que es una ${memory.brand} ${memory.model}. Con gusto te ayudamos con el mantenimiento. Si querés, te indico el rango de precio y cómo coordinar la revisión.`;
    }

    return `Claro 👍 Con gusto te ayudamos con el mantenimiento de la impresora. Si querés, te comparto el rango de precio y cómo coordinar la revisión.`;
  }

  if (intent === "GREETING") {
    return "Hola 😊 ¿En qué te puedo ayudar hoy?";
  }

  if (intent === "BUY") {
    return "Claro 😊 ¿La necesitás para estudio, trabajo o algo más exigente?";
  }

  if (intent === "PRICE_CHECK") {
    return "Claro 👍 ¿Me confirmás cuál producto o servicio te interesa para darte el precio correcto?";
  }

  if (intent === "SUPPORT") {
    return "Claro 👍 Contame qué problema presenta el equipo y con gusto te orientamos.";
  }

  if (t.includes("planes") || t.includes("plan")) {
    return "Claro 😊 ¿Te referís a planes de servicio, mantenimiento o a opciones de producto?";
  }

  return "Claro 😊 Contame un poquito más y con gusto te ayudo.";
}

/* ======================================
   MAIN
====================================== */

export async function handleInboundMessage(payload) {
  console.log("📩 INBOUND:", payload);

  const context = buildContext(payload);

  // 1) actualizar memoria antes de responder
  const memory = updateConversationMemory(context);

  console.log("🧠 MEMORY:", memory);

  // 2) AI principal con memoria
  let reply = await generateAIResponse(context, memory);

  // 3) fallback seguro
  if (!reply) {
    reply = buildFallbackReply(context, memory);
  }

  // 4) guardar última respuesta
  setMemory(context.phone, { last_ai_reply: reply });

  console.log("🧠 FINAL RESPONSE:", {
    reply,
    memory: getMemory(context.phone)
  });

  return {
    reply,
    media: []
  };
}

/*
====================================================
EVA SALES BRAIN — V2.1 (CLEAN + AI READY + SAFE)
====================================================
*/

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
   INTENT DETECTION (IMPROVED)
====================================== */

function detectIntent(text = "") {
  const t = normalize(text);

  if (!t) return "UNKNOWN";

  // GREETING
  if (
    t.includes("hola") ||
    t.includes("buenas") ||
    t.includes("buenos dias") ||
    t.includes("buenas tardes")
  ) return "GREETING";

  // SUPPORT
  if (
    t.includes("problema") ||
    t.includes("no funciona") ||
    t.includes("error") ||
    t.includes("dañado") ||
    t.includes("dañada")
  ) return "SUPPORT";

  // PRODUCT QUESTIONS
  if (
    t.includes("memoria") ||
    t.includes("ram") ||
    t.includes("ssd") ||
    t.includes("procesador") ||
    t.includes("bateria") ||
    t.includes("batería")
  ) return "PRODUCT_QUESTION";

  // USE CASES
  if (
    t.includes("estudio") ||
    t.includes("colegio") ||
    t.includes("universidad")
  ) return "USE_STUDY";

  if (
    t.includes("trabajo") ||
    t.includes("oficina")
  ) return "USE_WORK";

  if (
    t.includes("edicion") ||
    t.includes("edición") ||
    t.includes("diseño") ||
    t.includes("video")
  ) return "USE_HEAVY";

  // BUY INTENT (más fuerte)
  if (
    t.includes("precio") ||
    t.includes("cuanto") ||
    t.includes("cuánto") ||
    t.includes("informacion") ||
    t.includes("información") ||
    t.includes("tienen") ||
    t.includes("busco") ||
    t.includes("me interesa") ||
    t.includes("disponible") ||
    t.includes("laptop") ||
    t.includes("computadora")
  ) return "BUY";

  return "UNKNOWN";
}

/* ======================================
   AI PLACEHOLDER (FUTURE SAFE)
====================================== */

async function tryAIResponse(context) {
  // ⚠️ Aquí luego conectamos OpenAI / LLM
  // Por ahora NO rompe nada y permite activarlo después

  return null;
}

/* ======================================
   REPLY ENGINE (IMPROVED UX)
====================================== */

function buildSalesReply(intent, context) {
  const t = normalize(context.message);

  // GREETING
  if (intent === "GREETING") {
    return "Hola 😊 con gusto te ayudo.\n\n¿Estás buscando laptop para estudio, trabajo o algo más específico?";
  }

  // BUY
  if (intent === "BUY") {
    return "Claro 😊 con gusto te ayudo.\n\n¿La necesitás para estudio, trabajo o algo más exigente como diseño o edición?";
  }

  // STUDY
  if (intent === "USE_STUDY") {
    return (
      "Perfecto 👍 para estudio te recomiendo:\n\n" +
      "💻 Lenovo ThinkPad 11e\n" +
      "💰 ₡125.000\n" +
      "✔ Rápida\n✔ Resistente\n✔ Ideal para estudiantes\n\n" +
      "¿Querés que te envíe fotos reales?"
    );
  }

  // WORK
  if (intent === "USE_WORK") {
    return (
      "Perfecto 👍 para trabajo te puedo recomendar equipos más potentes.\n\n" +
      "¿Qué tipo de trabajo realizás? Así te recomiendo algo más preciso."
    );
  }

  // HEAVY
  if (intent === "USE_HEAVY") {
    return (
      "Perfecto 👍 para edición o diseño ocupás un equipo más potente.\n\n" +
      "¿Querés que te pase opciones disponibles?"
    );
  }

  // PRODUCT QUESTION
  if (intent === "PRODUCT_QUESTION") {
    return (
      "Claro 👍\n\n" +
      "✔ 8GB RAM\n✔ SSD rápido\n✔ Buen rendimiento general\n\n" +
      "Ideal para uso fluido diario.\n\n" +
      "¿Querés fotos o te ayudo a apartarla?"
    );
  }

  // SUPPORT
  if (intent === "SUPPORT") {
    return "Claro 👍 contame qué problema presenta el equipo y te orientamos.\n\nTrabajamos reparación y diagnóstico.";
  }

  // FALLBACK SMART
  if (t.includes("laptop") || t.includes("computadora")) {
    return "Perfecto 👍 ¿Para qué uso la necesitás?";
  }

  return "Claro 😊 contame qué estás buscando y con gusto te ayudo 👍";
}

/* ======================================
   MAIN HANDLER (AI READY)
====================================== */

export async function handleInboundMessage(payload) {
  console.log("📩 INBOUND:", payload);

  const context = buildContext(payload);

  // 1. Intent
  const intent = detectIntent(context.message);
  console.log("🧠 INTENT:", intent);

  // 2. TRY AI (NO rompe flujo actual)
  let reply = await tryAIResponse(context);

  // 3. FALLBACK A REGLAS
  if (!reply) {
    reply = buildSalesReply(intent, context);
  }

  const result = {
    reply,
    media: []
  };

  console.log("🧠 FINAL RESPONSE:", result);

  return result;
}

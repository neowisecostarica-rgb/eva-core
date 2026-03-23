/*
====================================================
EVA SALES BRAIN — V2 (STRUCTURED + FUTURE AI READY)
====================================================
*/

function normalize(text = "") {
  return String(text).toLowerCase().trim();
}

/* ======================================
   CONTEXT BUILDER (NEW)
====================================== */

function buildContext(payload) {
  return {
    phone: payload.phone,
    organization_id: payload.organization_id || null,
    channel: payload.channel || "whatsapp",
    message: payload.text
  };
}

/* ======================================
   INTENT DETECTION
====================================== */

function detectIntent(text = "") {
  const t = normalize(text);

  if (!t) return "UNKNOWN";

  if (t.includes("hola") || t.includes("buenas")) return "GREETING";

  if (
    t.includes("memoria") ||
    t.includes("ram") ||
    t.includes("ssd") ||
    t.includes("procesador") ||
    t.includes("bateria") ||
    t.includes("batería")
  ) {
    return "PRODUCT_QUESTION";
  }

  if (
    t.includes("estudio") ||
    t.includes("colegio") ||
    t.includes("universidad")
  ) return "USE_STUDY";

  if (t.includes("trabajo") || t.includes("oficina")) return "USE_WORK";

  if (t.includes("edicion") || t.includes("diseño")) return "USE_HEAVY";

  if (
    t.includes("precio") ||
    t.includes("cuanto") ||
    t.includes("laptop")
  ) return "BUY";

  if (
    t.includes("problema") ||
    t.includes("no funciona")
  ) return "SUPPORT";

  return "UNKNOWN";
}

/* ======================================
   REPLY ENGINE
====================================== */

function buildSalesReply(intent, context) {
  const t = normalize(context.message);

  if (intent === "GREETING") {
    return "Hola 😊 con gusto te ayudo.\n\n¿Estás buscando laptop para estudio, trabajo o algo más específico?";
  }

  if (intent === "BUY") {
    return "Claro 😊 te ayudo con gusto.\n\n¿La estás buscando para estudio, trabajo o algo más exigente como diseño o edición?";
  }

  if (intent === "USE_STUDY") {
    return (
      "Perfecto 👍 para estudio te recomiendo:\n\n" +
      "💻 ThinkPad 11e\n" +
      "💰 ₡125.000\n" +
      "✔ Rápida\n✔ Resistente\n\n" +
      "¿Querés fotos reales?"
    );
  }

  if (intent === "PRODUCT_QUESTION") {
    return (
      "Claro 👍\n\n" +
      "✔ 8GB RAM\n✔ SSD rápido\n\n" +
      "Ideal para uso fluido diario.\n\n" +
      "¿Querés fotos o apartarla?"
    );
  }

  if (intent === "SUPPORT") {
    return "Claro 👍 contame qué problema presenta el equipo y te orientamos.";
  }

  if (t.includes("laptop")) {
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

  const reply = buildSalesReply(intent, context);

  const result = {
    reply,
    media: []
  };

  console.log("🧠 FINAL RESPONSE:", result);

  return result;
}

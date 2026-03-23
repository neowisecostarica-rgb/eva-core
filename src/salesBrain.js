/*
====================================================
EVA SALES BRAIN — STABLE (NO AI)
====================================================
*/

/* ======================================
   EVA CONFIG
====================================== */

const EVA_CONFIG = {
  business_name: "Compu Store Costa Rica",
  assistant_name: "Eva",
  tone: "profesional cercano",
  primary_goal: "cerrar ventas"
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
   RESPUESTAS
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

  const intent = detectIntent(context.message);

  // 🧠 MEMORY
  if (intent === "PAYMENT" || intent === "PAYMENT_INFO") {
    setMemory(context.phone, { stage: intent });
  }

  const currentMemory = getMemory(context.phone);

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

  const reply = buildSalesReply(intent, context);

  return {
    reply,
    media: []
  };
}

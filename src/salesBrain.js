/*
====================================================
EVA SALES BRAIN — VENTAS FASE 1
====================================================
*/

function normalize(text = "") {
  return String(text).toLowerCase().trim();
}

function detectIntent(text = "") {
  const t = normalize(text);

  if (!t) return "UNKNOWN";

  if (t.includes("hola") || t.includes("buenas")) {
    return "GREETING";
  }

  if (
    t.includes("precio") ||
    t.includes("cuanto") ||
    t.includes("cuánto") ||
    t.includes("informacion") ||
    t.includes("información") ||
    t.includes("tienen") ||
    t.includes("busco") ||
    t.includes("me interesa")
  ) {
    return "BUY";
  }

  if (t.includes("no funciona") || t.includes("problema") || t.includes("error")) {
    return "SUPPORT";
  }

  return "UNKNOWN";
}

function buildSalesReply(intent, text) {
  const t = normalize(text);

  // 🟢 GREETING → abrir y dirigir
  if (intent === "GREETING") {
    return "Hola 😊 con gusto te ayudo.\n\n¿Estás buscando laptop para estudio, trabajo o algo más específico?";
  }

  // 🟢 BUY → guiar con intención
  if (intent === "BUY") {
    return "Claro 😊 te ayudo con gusto.\n\n¿La estás buscando para estudio, trabajo o algo más exigente como diseño o edición?";
  }

  // 🟢 SUPPORT → diagnóstico ligero
  if (intent === "SUPPORT") {
    return "Entiendo 👍 contame qué problema presenta el equipo y te orientamos con el diagnóstico.";
  }

  // 🟡 fallback inteligente (NO genérico)
  if (t.includes("laptop") || t.includes("computadora")) {
    return "Perfecto 👍\n\n¿Para qué uso la necesitas? Así te recomiendo una opción que realmente te funcione.";
  }

  // 🔴 fallback final (controlado)
  return "Claro 😊 contame un poco más sobre lo que estás buscando y te guío paso a paso 👍";
}

export async function handleInboundMessage(payload) {
  const { phone, text } = payload;

  console.log("📩 INBOUND:", { phone, text });

  const intent = detectIntent(text);
  console.log("🧠 INTENT:", intent);

  const reply = buildSalesReply(intent, text);

  const result = {
    reply,
    media: []
  };

  console.log("🧠 SALES RESPONSE:", result);

  return result;
}

/*
====================================================
EVA SALES BRAIN — VENTAS REAL (FASE 1 FIX)
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
    t.includes("me interesa") ||
    t.includes("laptop") ||
    t.includes("computadora")
  ) {
    return "BUY";
  }

  // 🟢 USO (CLAVE NUEVA)
  if (
    t.includes("estudio") ||
    t.includes("clases") ||
    t.includes("virtual") ||
    t.includes("colegio") ||
    t.includes("universidad")
  ) {
    return "USE_STUDY";
  }

  if (t.includes("trabajo") || t.includes("oficina")) {
    return "USE_WORK";
  }

  if (t.includes("edicion") || t.includes("diseño") || t.includes("video")) {
    return "USE_HEAVY";
  }

  if (t.includes("no funciona") || t.includes("problema") || t.includes("error")) {
    return "SUPPORT";
  }

  return "UNKNOWN";
}

function buildSalesReply(intent, text) {
  const t = normalize(text);

  // 🟢 GREETING
  if (intent === "GREETING") {
    return "Hola 😊 con gusto te ayudo.\n\n¿Estás buscando laptop para estudio, trabajo o algo más específico?";
  }

  // 🟢 BUY
  if (intent === "BUY") {
    return "Claro 😊 te ayudo con gusto.\n\n¿La estás buscando para estudio, trabajo o algo más exigente como diseño o edición?";
  }

  // 🟢 ESTUDIO → 🔥 RECOMENDACIÓN DIRECTA
  if (intent === "USE_STUDY") {
    return (
      "Perfecto 👍 para estudio y clases virtuales te recomiendo esta opción:\n\n" +
      "💻 Lenovo ThinkPad 11e\n" +
      "💰 ₡125.000\n" +
      "✔ Resistente (línea corporativa)\n" +
      "✔ Ideal para clases virtuales\n" +
      "✔ Rápida con SSD\n\n" +
      "¿Querés que te pase fotos reales o te explico un poco más?"
    );
  }

  // 🟢 TRABAJO
  if (intent === "USE_WORK") {
    return (
      "Perfecto 👍 para trabajo te recomiendo equipos un poco más potentes.\n\n" +
      "Tenemos opciones con 16GB RAM y mejor rendimiento.\n\n" +
      "¿Qué tipo de trabajo realizás? Así te recomiendo algo más preciso."
    );
  }

  // 🟢 EDICIÓN
  if (intent === "USE_HEAVY") {
    return (
      "Perfecto 👍 para edición o diseño ocupás algo más potente.\n\n" +
      "Te recomiendo equipos con mínimo 16GB RAM y mejor procesador.\n\n" +
      "¿Querés que te pase opciones disponibles?"
    );
  }

  // 🟢 SOPORTE
  if (intent === "SUPPORT") {
    return "Entiendo 👍 contame qué problema presenta el equipo y te orientamos con el diagnóstico.";
  }

  // 🟡 fallback inteligente
  if (t.includes("laptop") || t.includes("computadora")) {
    return "Perfecto 👍\n\n¿Para qué uso la necesitas? Así te recomiendo una opción que realmente te funcione.";
  }

  // 🔴 fallback final
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

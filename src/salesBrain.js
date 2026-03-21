/*
====================================================
EVA SALES BRAIN — VENTAS FASE 1 (STABLE + CONTEXT FIX)
====================================================
*/

function normalize(text = "") {
  return String(text).toLowerCase().trim();
}

function detectIntent(text = "") {
  const t = normalize(text);

  if (!t) return "UNKNOWN";

  // 🟢 GREETING
  if (t.includes("hola") || t.includes("Hola te saluda Eva de Compu Store Costa Rica")) {
    return "GREETING";
  }

  // 🟢 BUY
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

  // 🟢 USO — ESTUDIO
  if (
    t.includes("estudio") ||
    t.includes("clases") ||
    t.includes("virtual") ||
    t.includes("colegio") ||
    t.includes("universidad")
  ) {
    return "USE_STUDY";
  }

  // 🟢 USO — TRABAJO
  if (
    t.includes("trabajo") ||
    t.includes("oficina") ||
    t.includes("teletrabajo")
  ) {
    return "USE_WORK";
  }

  // 🟢 USO — ALTO RENDIMIENTO
  if (
    t.includes("edicion") ||
    t.includes("edición") ||
    t.includes("diseño") ||
    t.includes("video")
  ) {
    return "USE_HEAVY";
  }

  // 🟢 PREGUNTAS DE PRODUCTO
  if (
    t.includes("memoria") ||
    t.includes("ram") ||
    t.includes("almacenamiento") ||
    t.includes("ssd") ||
    t.includes("procesador") ||
    t.includes("bateria") ||
    t.includes("batería") ||
    t.includes("cuanto dura") ||
    t.includes("cuánto dura")
  ) {
    return "PRODUCT_QUESTION";
  }

  // 🟢 SOPORTE
  if (
    t.includes("no funciona") ||
    t.includes("problema") ||
    t.includes("error")
  ) {
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

  // 🟢 ESTUDIO → RECOMENDACIÓN DIRECTA
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

  // 🟢 ALTO RENDIMIENTO
  if (intent === "USE_HEAVY") {
    return (
      "Perfecto 👍 para edición o diseño ocupás algo más potente.\n\n" +
      "Te recomiendo equipos con mínimo 16GB RAM y mejor procesador.\n\n" +
      "¿Querés que te pase opciones disponibles?"
    );
  }

  // 🟢 RESPUESTA A PREGUNTAS DE PRODUCTO
  if (intent === "PRODUCT_QUESTION") {
    return (
      "Claro 👍 te cuento:\n\n" +
      "💻 Este modelo viene con:\n" +
      "✔ 8GB RAM (ideal para estudio y uso diario)\n" +
      "✔ 256GB SSD (rápido)\n\n" +
      "Es un equipo pensado para que te funcione fluido en clases virtuales y tareas.\n\n" +
      "Si querés te puedo pasar fotos reales o ayudarte a apartarla 😊"
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

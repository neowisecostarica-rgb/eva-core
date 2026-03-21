/*
====================================================
EVA CORE - SALES BRAIN
====================================================
*/

function normalizeText(text = "") {
  return String(text).trim().toLowerCase();
}

function detectIntent(text = "") {
  const t = normalizeText(text);

  if (!t) return "UNKNOWN";

  if (
    t.includes("hola") ||
    t.includes("buenas") ||
    t.includes("buenos dias") ||
    t.includes("buen día") ||
    t.includes("buen día") ||
    t === "hi" ||
    t === "hello"
  ) {
    return "GREETING";
  }

  if (
    t.includes("precio") ||
    t.includes("cuanto") ||
    t.includes("cuánto") ||
    t.includes("tienen") ||
    t.includes("disponible") ||
    t.includes("informacion") ||
    t.includes("información") ||
    t.includes("me interesa") ||
    t.includes("quiero") ||
    t.includes("busco")
  ) {
    return "BUY";
  }

  if (
    t.includes("ya cambie") ||
    t.includes("ya cambié") ||
    t.includes("listo") ||
    t.includes("ok") ||
    t.includes("perfecto")
  ) {
    return "CONFIRM";
  }

  if (
    t.includes("problema") ||
    t.includes("no funciona") ||
    t.includes("error") ||
    t.includes("ayuda") ||
    t.includes("soporte")
  ) {
    return "SUPPORT";
  }

  return "UNKNOWN";
}

function buildReply(intent, text = "") {
  switch (intent) {
    case "GREETING":
      return "Hola 😊 gracias por escribir. ¿Buscás información de algún equipo en específico o querés que te recomiende una opción?";

    case "BUY":
      return "Claro 😊 contame qué tipo de equipo buscás y para qué uso lo necesitás, y con gusto te ayudo a encontrar la mejor opción 👍";

    case "CONFIRM":
      return "Perfecto 🙌 ya lo tengo presente. Contame qué ocupás y te ayudo con el siguiente paso.";

    case "SUPPORT":
      return "Entiendo. Contame un poco más sobre el problema y te ayudo a revisarlo paso a paso.";

    default:
      if (normalizeText(text).includes("deploy")) {
        return "Entiendo. Si el deploy no está funcionando, pegáme el error exacto o el log y lo revisamos paso a paso.";
      }

      return "Claro 😊 contame un poco más y te ayudo mejor 👍";
  }
}

export async function handleInboundMessage(payload) {
  const { phone, text } = payload;

  console.log("📩 INBOUND:", { phone, text });

  const intent = detectIntent(text);
  console.log("🧠 INTENT:", intent);

  const reply = buildReply(intent, text);

  const result = {
    reply,
    media: []
  };

  console.log("🧠 RAW RESULT FROM BRAIN:", result);

  return result;
}

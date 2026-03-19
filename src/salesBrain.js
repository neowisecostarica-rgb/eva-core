
console.log("🚨 USANDO SALES BRAIN CORRECTO 🚨");
console.log("🔥🔥🔥 SALES BRAIN NUEVO ACTIVO 🔥🔥🔥");

/*
====================================================
EVA SALES BRAIN (FIXED + CONTRATO API CORRECTO)
====================================================
*/

import pool from "./db.js";
import { searchCatalog } from "./brain/commerce/catalogEngine.js";
import { generateReply } from "./brain/replies/replyEngine.js";

/*
====================================================
HELPERS
====================================================
*/

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isGreeting(text = "") {
  const t = normalizeText(text);

  return [
    "hola",
    "buenas",
    "buenos dias",
    "buen día",
    "buen dia",
    "buenas tardes",
    "buenas noches",
    "info",
    "informacion",
    "información",
    "consulta"
  ].includes(t);
}

/*
====================================================
INTENT DETECTION
====================================================
*/

function detectIntent(text = "") {
  const t = normalizeText(text);

  if (
    t.includes("precio") ||
    t.includes("cuanto") ||
    t.includes("cuánto") ||
    t.includes("vale")
  ) return "PRICE";

  if (
    t.includes("quiero") ||
    t.includes("comprar") ||
    t.includes("me interesa") ||
    t.includes("ocupo") ||
    t.includes("necesito")
  ) return "BUY";

  if (
    t.includes("tienen") ||
    t.includes("busco") ||
    t.includes("laptop") ||
    t.includes("computadora") ||
    t.includes("impresora") ||
    t.includes("monitor") ||
    t.includes("pantalla") ||
    t.includes("thinkpad") ||
    t.includes("lenovo") ||
    t.includes("dell") ||
    t.includes("hp")
  ) return "PRODUCT_SEARCH";

  return "UNKNOWN";
}

/*
====================================================
MAIN HANDLER
====================================================
*/

export async function handleInbound({
  organization_id,
  phone,
  text,
  conversation_id = null
}) {
  console.log("📩 INBOUND:", { phone, text });

  try {
    const intent = detectIntent(text);
    const greetingOnly = isGreeting(text);

    console.log("🧠 INTENT:", intent);

    /*
    ====================================================
    SEARCH PRODUCTS
    ====================================================
    */

  const products = await searchCatalog({
  organization_id,
  text
});

console.log("🧪 ORG ID:", organization_id);
console.log("📦 PRODUCTS FOUND:", products);

    /*
    ====================================================
    GREETING
    ====================================================
    */

    if (greetingOnly && (!products || products.length === 0)) {
      return {
        reply: "Hola 😊 buenas tardes, claro que sí 🙌\n\nSoy Eva de Compu Store Costa Rica.\n\nTe puedo ayudar con laptops, computadoras, impresoras y monitores.\n\n¿Andas buscando algún equipo en específico?",
        media: []
      };
    }

    /*
    ====================================================
    GENERATE REPLY
    ====================================================
    */

    const reply = generateReply({
      text,
      intent,
      products
    });

    /*
    ====================================================
    RESPUESTA FINAL (FIX CRÍTICO)
    ====================================================
    */

    return {
      reply: reply?.text || "Gracias por escribirnos 🙌",
      media: reply?.media || []
    };

  } catch (err) {
    console.error("❌ HANDLE INBOUND ERROR:", err);

    return {
      reply: "Hubo un error procesando tu mensaje.",
      media: []
    };
  }
}

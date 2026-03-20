console.log("🚨 SALES BRAIN CLEAN VERSION 🚨");

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
    "buen dia",
    "buenas tardes",
    "buenas noches",
    "info",
    "informacion",
    "consulta"
  ].includes(t);
}

/*
====================================================
INTENT DETECTION (CORRECTO Y CERRADO)
====================================================
*/

function detectIntent(text = "") {
  const t = normalizeText(text);

  // CONFIRM
  if (
    t === "si" ||
    t === "sí" ||
    t.includes("claro") ||
    t.includes("ok") ||
    t.includes("dale") ||
    t.includes("de acuerdo")
  ) return "CONFIRM";

  // REJECT
  if (
    t === "no" ||
    t.includes("no gracias") ||
    t.includes("no quiero")
  ) return "REJECT";

  // PRICE
  if (
    t.includes("precio") ||
    t.includes("cuanto") ||
    t.includes("vale")
  ) return "PRICE";

  // BUY
  if (
    t.includes("quiero") ||
    t.includes("comprar") ||
    t.includes("me interesa") ||
    t.includes("ocupo") ||
    t.includes("necesito")
  ) return "BUY";

  // SEARCH
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

    let products = [];

    try {
      products = await searchCatalog({
        organization_id,
        text
      });

      console.log("📦 PRODUCTS FOUND:", products?.length || 0);
    } catch (err) {
      console.error("❌ SEARCH ERROR:", err.message);
      products = [];
    }

    /*
    ====================================================
    PRODUCT FLOW
    ====================================================
    */

    if (products.length > 0) {
      try {
        const reply = generateReply({
          text,
          intent,
          products
        });

        if (reply && reply.text) {
          return {
            reply: reply.text,
            media: reply.media || []
          };
        }
      } catch (err) {
        console.error("❌ REPLY ERROR:", err);
      }
    }

    /*
    ====================================================
    GREETING
    ====================================================
    */

    if (greetingOnly) {
      return {
        reply:
          "Hola 😊 con gusto te ayudo 🙌 ¿Buscás algún equipo o lo necesitás para estudio o trabajo?",
        media: []
      };
    }

    /*
    ====================================================
    CONVERSACIÓN BÁSICA (CLAVE)
    ====================================================
    */

    if (intent === "CONFIRM") {
      return {
        reply:
          "Perfecto 🙌 ya casi lo coordinamos.\n\n¿Preferís retiro o envío?",
        media: []
      };
    }

    if (intent === "REJECT") {
      return {
        reply:
          "Todo bien 😊\n\nSi querés puedo mostrarte otras opciones que se ajusten mejor 👍",
        media: []
      };
    }

    if (intent === "PRICE") {
      return {
        reply:
          "Claro 😊 decime cuál modelo viste o qué tipo de equipo buscás y te doy el precio exacto 👍",
        media: []
      };
    }

    if (intent === "BUY") {
      return {
        reply:
          "Buenísimo 🙌 contame para qué uso la necesitás y tu presupuesto aproximado y te recomiendo bien 👍",
        media: []
      };
    }

    if (intent === "PRODUCT_SEARCH") {
      return {
        reply:
          "Claro 😊 ¿la necesitás para estudio, oficina o algo más exigente?",
        media: []
      };
    }

    /*
    ====================================================
    FALLBACK HUMANO
    ====================================================
    */

    return {
      reply:
        "Claro 😊 contame un poco más y te ayudo mejor 👍",
      media: []
    };

  } catch (err) {
    console.error("❌ HANDLE ERROR:", err);

    return {
      reply: "Hubo un error procesando tu mensaje.",
      media: []
    };
  }
}

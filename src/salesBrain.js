console.log("🚨 USANDO SALES BRAIN CORRECTO 🚨");
console.log("🔥🔥🔥 SALES BRAIN NUEVO ACTIVO 🔥🔥🔥");

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
INTENT DETECTION
====================================================
*/

function detectIntent(text = "") {
  const t = normalizeText(text);

  if (
    t.includes("precio") ||
    t.includes("cuanto") ||
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

    let products = [];

    try {
      products = await searchCatalog({
        organization_id,
        text
      });

      console.log("📦 PRODUCTS FOUND:", products?.length || 0);
    } catch (err) {
      console.error("❌ SEARCH CATALOG ERROR:", err.message);
      products = [];
    }

    /*
    ====================================================
    PRODUCT FLOW
    ====================================================
    */

    if (products && products.length > 0) {
      console.log("🟢 PRODUCT FLOW");

      try {
        const reply = generateReply({
          text,
          intent,
          products
        });

        if (reply?.text) {
          return {
            reply: reply.text,
            media: reply.media || []
          };
        }
      } catch (err) {
        console.error("❌ GENERATE REPLY ERROR:", err);
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
          "Hola 😊 con mucho gusto te ayudo 🙌\n\nContame, ¿estás buscando algún equipo en específico o sería para estudio, trabajo o algo más exigente?",
        media: []
      };
    }

    /*
    ====================================================
    INTENT RESPONSES
    ====================================================
    */

    if (intent === "PRICE") {
      return {
        reply:
          "Claro 😊 con gusto te ayudo con eso 🙌\n\n¿Me podés contar cuál modelo viste o qué tipo de equipo estás buscando? Así te doy el precio exacto 👍",
        media: []
      };
    }

    if (intent === "BUY") {
      return {
        reply:
          "Perfecto 🙌 con gusto te ayudo a encontrar la mejor opción 😊\n\nContame, ¿para qué uso la necesitás y qué presupuesto tenés pensado más o menos?",
        media: []
      };
    }

    if (intent === "PRODUCT_SEARCH") {
      return {
        reply:
          "Claro 😊 tenemos varias opciones disponibles 🙌\n\nPara recomendarte bien, ¿la necesitás para estudio, oficina o algo más exigente?",
        media: []
      };
    }

    /*
    ====================================================
    FALLBACK
    ====================================================
    */

    return {
      reply:
        "Claro 😊 contame un poquito más sobre lo que estás buscando 🙌 así te ayudo mejor y te recomiendo una buena opción 👍",
      media: []
    };

  } catch (err) {
    console.error("❌ HANDLE INBOUND ERROR:", err);

    return {
      reply: "Hubo un error procesando tu mensaje.",
      media: []
    };
  }
}

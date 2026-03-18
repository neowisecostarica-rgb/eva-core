/*
====================================================
EVA SALES BRAIN (ORCHESTRATOR CLEAN)
====================================================
*/

import pool from "./db.js";

/*
ENGINES
*/
import { searchCatalog } from "./brain/commerce/catalogEngine.js";
import { generateReply } from "./brain/replies/replyEngine.js";

/*
====================================================
NORMALIZATION
====================================================
*/

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/*
====================================================
INTENT (BÁSICO Y ESTABLE)
====================================================
*/

function detectIntent(text = "") {
  const t = normalizeText(text);

  if (t.includes("hola") || t.includes("buenas")) return "GREETING";

  if (
    t.includes("precio") ||
    t.includes("cuanto") ||
    t.includes("vale")
  ) return "BUY";

  if (
    t.includes("tienen") ||
    t.includes("hay") ||
    t.includes("busco")
  ) return "PRODUCT_SEARCH";

  return "UNKNOWN";
}

/*
====================================================
INTEREST LEVEL (BÁSICO)
====================================================
*/

function detectInterestLevel(text = "") {
  const t = normalizeText(text);

  if (
    t.includes("quiero") ||
    t.includes("me interesa") ||
    t.includes("lo compro") ||
    t.includes("apartar")
  ) return "HIGH";

  return "LOW";
}

/*
====================================================
STAGE (MVP SIMPLE)
====================================================
*/

function resolveStage({ intent, hasProducts }) {

  if (intent === "GREETING") return "new";

  if (hasProducts) return "catalog_shown";

  if (intent === "BUY") return "considering";

  return "new";
}

/*
====================================================
MAIN HANDLER
====================================================
*/

export async function handleInbound({
  organization_id,
  phone,
  text
}) {

  console.log("📩 INBOUND:", { phone, text });

  try {

    /*
    ====================================================
    DETECCIÓN BÁSICA
    ====================================================
    */

    const intent = detectIntent(text);
    const interestLevel = detectInterestLevel(text);

    /*
    ====================================================
    CATÁLOGO
    ====================================================
    */

    let catalogMatches = [];

    try {
      catalogMatches = await searchCatalog({
        organization_id,
        text
      });
    } catch (err) {
      console.warn("⚠️ catalog failed:", err.message);
      catalogMatches = [];
    }

    /*
    ====================================================
    STAGE
    ====================================================
    */

    const stage = resolveStage({
      intent,
      hasProducts: catalogMatches.length > 0
    });

    /*
    ====================================================
    GENERAR RESPUESTA (ÚNICA FUENTE)
    ====================================================
    */

    const reply = await generateReply({
      text,
      intent,
      stage,
      catalogMatches,
      interestLevel
    });

    /*
    ====================================================
    RESPUESTA FINAL
    ====================================================
    */

    return {
      reply,
      meta: {
        intent,
        stage,
        products_found: catalogMatches.length
      }
    };

  } catch (err) {

    console.error("❌ salesBrain error:", err.message);

    return {
      reply: {
        text: "Hubo un problema 🙏 pero con gusto te ayudo.\n\n¿Buscas laptop para estudio o trabajo?",
        media: []
      },
      meta: {
        error: true
      }
    };

  }
}

/*
====================================================
EVA SALES BRAIN (FIXED + VENTAS ACTIVAS)
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

/*
====================================================
INTENT DETECTION (BÁSICO)
====================================================
*/

function detectIntent(text = "") {
  const t = normalizeText(text);

  if (t.includes("precio") || t.includes("cuanto")) return "PRICE";
  if (t.includes("tienen") || t.includes("busco")) return "PRODUCT_SEARCH";
  if (t.includes("quiero") || t.includes("comprar") || t.includes("me interesa")) return "BUY";

  return "UNKNOWN";
}

/*
====================================================
SALES SIGNALS (RADAR)
====================================================
*/

function detectSalesSignals(text = "", intent = "UNKNOWN") {
  const t = normalizeText(text);
  const signals = [];

  // USE CASE
  if (t.includes("estudio") || t.includes("colegio")) {
    signals.push({ type: "USE_CASE_ESTUDIO", value: "estudio" });
  }

  if (t.includes("trabajo") || t.includes("oficina")) {
    signals.push({ type: "USE_CASE_TRABAJO", value: "trabajo" });
  }

  // PRICE
  if (t.includes("caro")) {
    signals.push({ type: "PRICE_OBJECTION", value: "price objection" });
  }

  if (t.includes("barato")) {
    signals.push({ type: "LOW_PRICE_SEARCH", value: "cheaper option" });
  }

  // INTENT
  if (intent === "BUY") {
    signals.push({ type: "BUY_INTENT", value: "buy" });
  }

  if (intent === "PRODUCT_SEARCH") {
    signals.push({ type: "PRODUCT_SEARCH", value: "search" });
  }

  // PRODUCT DEMAND
  if (t.includes("laptop") || t.includes("computadora")) {
    signals.push({ type: "PRODUCT_DEMAND", value: "laptop" });
  }

  if (t.includes("impresora")) {
    signals.push({ type: "PRODUCT_DEMAND", value: "printer" });
  }

  if (t.includes("monitor") || t.includes("pantalla")) {
    signals.push({ type: "PRODUCT_DEMAND", value: "monitor" });
  }

  return signals;
}

/*
====================================================
SAVE SIGNALS
====================================================
*/

async function saveSalesSignals({ organization_id, phone, signals = [] }) {
  if (!signals.length) return;

  try {
    const values = [];
    const placeholders = [];

    let index = 1;

    for (const s of signals) {
      placeholders.push(
        `($${index++}, $${index++}, $${index++}, $${index++}, NOW())`
      );

      values.push(
        organization_id,
        phone,
        s.type,
        s.value
      );
    }

    await pool.query(
      `
      INSERT INTO sales_intelligence_events (
        organization_id,
        lead_phone,
        event_type,
        event_value,
        created_at
      )
      VALUES ${placeholders.join(",")}
      `,
      values
    );

    console.log("✅ SIGNALS SAVED:", signals);

  } catch (err) {
    console.error("❌ SAVE SALES SIGNALS ERROR:", err);
  }
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
    DETECTION
    ====================================================
    */

    const intent = detectIntent(text);
    const signals = detectSalesSignals(text, intent);

    console.log("🧠 INTENT:", intent);
    console.log("🧠 SIGNALS:", signals);

    /*
    ====================================================
    SAVE RADAR
    ====================================================
    */

    await saveSalesSignals({
      organization_id,
      phone,
      signals
    });

    /*
    ====================================================
    SEARCH PRODUCTS
    ====================================================
    */

    const products = await searchCatalog({
      organization_id,
      text
    });

    console.log("📦 PRODUCTS FOUND:", products);

    /*
    ====================================================
    GENERATE REPLY (VENTAS ACTIVAS)
    ====================================================
    */

    const reply = generateReply({
      text,
      intent,
      products
    });

    /*
    ====================================================
    RETURN
    ====================================================
    */

    return {
      reply
    };

  } catch (err) {
    console.error("❌ HANDLE INBOUND ERROR:", err);

    return {
      reply: {
        text: "Hubo un error procesando tu mensaje."
      }
    };
  }
}

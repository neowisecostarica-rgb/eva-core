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
    const isHotLead = signals.some(s => s.type === "BUY_INTENT") || intent === "BUY";
    const hasPriceObjection = signals.some(s => s.type === "PRICE_OBJECTION");
    const isLookingCheap = signals.some(s => s.type === "LOW_PRICE_SEARCH");
    
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

   let reply = generateReply({
  text,
  intent,
  products
});

    /*
====================================================
🔥 OBJECIÓN DE PRECIO
====================================================
*/

if ((hasPriceObjection || isLookingCheap) && Array.isArray(products) && products.length > 0) {

  const product = products[0];

  const price = product?.price_crc
    ? `₡${Number(product.price_crc).toLocaleString()}`
    : "Consultar precio";

  reply = {
    text: `Entiendo completamente 🙌

Estos equipos son línea corporativa, diseñados para durar más que una laptop convencional.

💻 ${product.name}
💰 ${price}

Incluyen SSD rápido, buen rendimiento y 1 año de garantía.

Muchas veces lo barato sale caro cuando empiezan a fallar.

Si quieres, puedo recomendarte la mejor opción según tu presupuesto 👍`,
    media: reply.media || []
  };

  console.log("💰 PRICE OBJECTION HANDLED");

}
    
/*
====================================================
🔥 HOT LEAD → CIERRE
====================================================
*/

if (isHotLead && Array.isArray(products) && products.length > 0) {

  const product = products[0];

  const price = product?.price_crc
    ? `₡${Number(product.price_crc).toLocaleString()}`
    : "Consultar precio";

  reply = {
    text: `Esta opción es de las más buscadas 👇

💻 ${product.name}
💰 ${price}

✅ Línea corporativa
✅ SSD rápido
✅ 1 año de garantía

Tenemos pocas unidades disponibles.

Puedes apartarla con ₡20.000 🙌

¿Te la reservo?`,
    media: reply.media || []
  };

  console.log("🔥 HOT LEAD DETECTED → CLOSING MODE");
}

    /*
====================================================
FOLLOWUP CREATION (SMART)
====================================================
*/

try {

  const shouldCreateFollowup =
    (intent === "PRODUCT_SEARCH" || intent === "BUY") &&
    Array.isArray(products) &&
    products.length > 0;

  if (shouldCreateFollowup) {

    // evitar duplicados
    const existing = await pool.query(
      `
      SELECT id FROM followups
      WHERE organization_id = $1
      AND lead_phone = $2
      AND status = 'PENDING'
      LIMIT 1
      `,
      [organization_id, phone]
    );

    if (!existing.rowCount) {

      const scheduledFor = new Date(Date.now() + (24 * 60 * 60 * 1000));

      await pool.query(
        `
        INSERT INTO followups (
          organization_id,
          lead_phone,
          conversation_id,
          reason,
          scheduled_for,
          status,
          attempt,
          sent,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 'PENDING', 0, false, NOW(), NOW())
        `,
        [
          organization_id,
          phone,
          conversation_id || null,
          "sales_followup",
          scheduledFor
        ]
      );

      console.log("📆 FOLLOWUP CREATED", {
        phone,
        scheduledFor
      });

    }

  }

} catch (err) {
  console.error("❌ FOLLOWUP CREATION ERROR", err.message);
}
    
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

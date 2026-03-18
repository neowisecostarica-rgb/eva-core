/*
====================================================
EVA SALES BRAIN (ORCHESTRATOR CLEAN + FOLLOWUPS)
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
INTENT
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
INTEREST LEVEL
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
MEMORY DETECTION (CRM BÁSICO)
====================================================
*/

function detectUseCase(text = "") {
  const t = normalizeText(text);

  if (t.includes("estudio") || t.includes("colegio")) return "ESTUDIO";
  if (t.includes("trabajo") || t.includes("oficina")) return "TRABAJO";
  if (t.includes("gaming") || t.includes("juegos")) return "GAMING";

  return null;
}

function detectBudget(text = "") {
  const match = text.match(/(\d{5,7})/);
  if (!match) return null;

  return Number(match[1]);
}

function detectProductInterest(text = "") {
  const t = normalizeText(text);

  if (t.includes("laptop") || t.includes("computadora")) return "LAPTOP";
  if (t.includes("impresora")) return "PRINTER";

  return null;
}
/*
====================================================
SALES INTELLIGENCE DETECTION
====================================================
*/

function detectSalesSignals(text = "", intent = "UNKNOWN") {
  const t = normalizeText(text);
  const signals = [];

  /*
  ====================================================
  USE CASE
  ====================================================
  */

  if (t.includes("estudio") || t.includes("colegio")) {
    signals.push({ type: "USE_CASE_ESTUDIO", value: "estudio" });
  }

  if (t.includes("trabajo") || t.includes("oficina")) {
    signals.push({ type: "USE_CASE_TRABAJO", value: "trabajo" });
  }

  /*
  ====================================================
  PRICE SIGNALS
  ====================================================
  */

  if (t.includes("caro") || t.includes("mucho")) {
    signals.push({ type: "PRICE_OBJECTION", value: "price objection" });
  }

  if (t.includes("barato") || t.includes("economico") || t.includes("económico")) {
    signals.push({ type: "LOW_PRICE_SEARCH", value: "cheaper option" });
  }

  /*
  ====================================================
  INTENT
  ====================================================
  */

  if (intent === "BUY") {
    signals.push({ type: "BUY_INTENT", value: "buy" });
  }

  if (intent === "PRODUCT_SEARCH") {
    signals.push({ type: "PRODUCT_SEARCH", value: "search" });
  }

  /*
  ====================================================
  PRODUCT DEMAND (🔥 NUEVO)
  ====================================================
  */

  if (t.includes("laptop") || t.includes("computadora")) {
    signals.push({ type: "PRODUCT_DEMAND", value: "laptop" });
  }

  if (t.includes("impresora")) {
    signals.push({ type: "PRODUCT_DEMAND", value: "printer" });
  }

  if (t.includes("monitor") || t.includes("pantalla")) {
    signals.push({ type: "PRODUCT_DEMAND", value: "monitor" });
  }

  /*
  ====================================================
  BUDGET
  ====================================================
  */

  if (/\d{5,7}/.test(text)) {
    signals.push({ type: "BUDGET_DETECTED", value: "budget mentioned" });
  }

  return signals;
}
/*
====================================================
STAGE
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
    CANCEL PENDING FOLLOWUPS (SI CLIENTE RESPONDE)
    ====================================================
    */

    try {
      await pool.query(
        `
        UPDATE followups
        SET status = 'CANCELLED',
            updated_at = NOW()
        WHERE organization_id = $1
        AND lead_phone = $2
        AND status = 'PENDING'
      `,
        [organization_id, phone]
      );
    } catch (err) {
      console.error("FOLLOWUP CANCEL ERROR", err.message);
    }

    /*
    ====================================================
    DETECCIÓN
    ====================================================
    */

    const intent = detectIntent(text);
    /*
====================================================
SALES RADAR
====================================================
*/

const signals = detectSalesSignals(text, intent);

console.log("🧠 SIGNALS:", signals);

await saveSalesSignals({
  organization_id,
  phone,
  signals
});
    const signals = detectSalesSignals(text, intent);

// DEBUG
console.log("🧠 SIGNALS:", signals);

console.log("💾 SAVING SIGNALS...");

await saveSalesSignals({
  organization_id,
  phone,
  signals
});

    // ====================================================
// SALES SIGNALS (RADAR)
// ====================================================

const signals = detectSalesSignals(text, intent);

await saveSalesSignals({
  organization_id,
  phone,
  signals
});
    
    const interestLevel = detectInterestLevel(text);
    const salesSignals = detectSalesSignals(text, intent);
    /*
====================================================
EXTRAER DATOS DEL MENSAJE (MEMORIA)
====================================================
*/

const use_case = detectUseCase(text);
const budget_crc = detectBudget(text);
const product_interest = detectProductInterest(text);

    /*
====================================================
SAVE MEMORY (UPSERT LEAD)
====================================================
*/

try {
  await pool.query(`
    INSERT INTO leads (organization_id, phone, use_case, budget_crc, product_interest)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (phone)
    DO UPDATE SET
      use_case = COALESCE(EXCLUDED.use_case, leads.use_case),
      budget_crc = COALESCE(EXCLUDED.budget_crc, leads.budget_crc),
      product_interest = COALESCE(EXCLUDED.product_interest, leads.product_interest),
      updated_at = NOW()
  `, [
    organization_id,
    phone,
    use_case,
    budget_crc,
    product_interest
  ]);
} catch (err) {
  console.warn("⚠️ lead memory failed:", err.message);
}

    /*
====================================================
SAVE SALES INTELLIGENCE
====================================================
*/

try {
  for (const signal of salesSignals) {
    await pool.query(
      `
      INSERT INTO sales_intelligence_events (
        organization_id,
        phone,
        event_type,
        event_value,
        created_at
      )
      VALUES ($1, $2, $3, $4, NOW())
    `,
      [
        organization_id,
        phone,
        signal.type,
        signal.value
      ]
    );
  }
} catch (err) {
  console.warn("⚠️ sales intelligence failed:", err.message);
}
    
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
READ MEMORY
====================================================
*/

let memory = {};

try {
  const result = await pool.query(`
    SELECT use_case, budget_crc, product_interest
    FROM leads
    WHERE phone = $1
    LIMIT 1
  `, [phone]);

  memory = result.rows[0] || {};
} catch (err) {
  console.warn("⚠️ memory read failed:", err.message);
}
    
    /*
    ====================================================
    GENERAR RESPUESTA
    ====================================================
    */

    const reply = await generateReply({
  text,
  intent,
  stage,
  catalogMatches,
  interestLevel,
  memory
});

    /*
    ====================================================
    CREATE FOLLOWUP (ANTI DUPLICADOS)
    ====================================================
    */

    try {

      const shouldCreateFollowup =
        catalogMatches.length > 0 ||
        intent === "BUY";

      if (shouldCreateFollowup) {

        const existing = await pool.query(
          `
          SELECT id
          FROM followups
          WHERE organization_id = $1
          AND lead_phone = $2
          AND status = 'PENDING'
          LIMIT 1
        `,
          [organization_id, phone]
        );

        if (existing.rowCount === 0) {

          const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000);

          await pool.query(
            `
            INSERT INTO followups (
              organization_id,
              lead_phone,
              reason,
              scheduled_for,
              status,
              attempt_count,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, 'PENDING', 0, NOW(), NOW())
          `,
            [
              organization_id,
              phone,
              "sales_followup",
              scheduledFor
            ]
          );

        }

      }

    } catch (err) {
      console.error("FOLLOWUP CREATE ERROR", err.message);
    }

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
/*
====================================================
SAVE SALES SIGNALS (RADAR)
====================================================
*/

async function saveSalesSignals({ organization_id, phone, signals = [] }) {
  if (!signals.length) return;

  try {
    const values = [];
    const placeholders = [];

    let index = 1;

    for (const s of signals) {
      placeholders.push(`($${index++}, $${index++}, $${index++}, $${index++}, NOW())`);
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
    console.error("❌ SAVE SALES SIGNALS ERROR FULL:", err);
  }
}

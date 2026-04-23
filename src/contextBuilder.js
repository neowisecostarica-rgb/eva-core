/*
====================================================
EVA CORE — CONTEXT BUILDER (FINAL FIXED + SMART PRODUCTS)
====================================================
*/

import pool from "./db.js";
import { detectIntent } from "./brain/engines/intentEngine.js";

/*
====================================================
UTILS
====================================================
*/

function safe(v) {
  return String(v || "").trim();
}

function lower(v) {
  return safe(v).toLowerCase();
}

/*
====================================================
EXTRACT SIGNALS
====================================================
*/

function extractSignals(text = "") {
  const t = lower(text);

  return {
    wantsLaptop:
      t.includes("laptop") ||
      t.includes("computadora") ||
      t.includes("pc"),

    brand:
      t.includes("dell")
        ? "dell"
        : t.includes("hp")
        ? "hp"
        : t.includes("lenovo")
        ? "lenovo"
        : null,
  };
}

/*
====================================================
KNOWN DATA
====================================================
*/

function extractKnownData(text = "") {
  const t = lower(text);

  let product_interest = null;

  if (t.includes("laptop") || t.includes("computadora")) {
    product_interest = "LAPTOP";
  }

  return { product_interest };
}

/*
====================================================
MAIN
====================================================
*/

export async function buildContext({
  organization_id,
  phone,
  text = "",
}) {
  try {
    const business =
      (
        await pool.query(
          `SELECT * FROM business_profile WHERE organization_id = $1 LIMIT 1`,
          [organization_id]
        )
      ).rows[0] || {};

    const config =
      (
        await pool.query(
          `SELECT * FROM prompt_config WHERE organization_id = $1 LIMIT 1`,
          [organization_id]
        )
      ).rows[0] || {};

    const signals = extractSignals(text);

    /*
    ============================
    🔥 PRODUCTOS INTELIGENTES
    ============================
    */

    const result = await pool.query(
      `
      SELECT name, description, price, category
      FROM product_catalog
      WHERE organization_id = $1
      AND is_active = true
      `,
      [organization_id]
    );

    let products = result.rows || [];

    // 🔥 filtro por laptop
    if (signals.wantsLaptop) {
      products = products.filter(p =>
        lower(p.name).includes("laptop") ||
        lower(p.name).includes("thinkpad") ||
        lower(p.name).includes("latitude")
      );
    }

    // 🔥 filtro por marca
    if (signals.brand) {
      products = products.filter(p =>
        lower(p.name).includes(signals.brand)
      );
    }

    products = products.slice(0, 3);

    /*
    ============================
    OUTPUT
    ============================
    */

    return {
      organization: {
        id: organization_id,
        business_name: business?.business_name || "negocio",
      },

      assistant: {
        name: config?.agent_name || "Asistente",
      },

      intent: detectIntent(text),

      known_data: extractKnownData(text),

      user_message: safe(text),

      products, // 🔥 ahora filtrados correctamente

      sales_context: {},
    };

  } catch (err) {
    console.error("❌ CONTEXT ERROR:", err);

    return {
      organization: { id: organization_id },
      assistant: { name: "Asistente" },
      products: [],
      user_message: safe(text),
    };
  }
}

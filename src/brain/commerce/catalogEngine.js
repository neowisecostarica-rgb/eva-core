/*
====================================================
EVA CORE — CATALOG ENGINE (SOURCE OF TRUTH vNext FIXED)
====================================================
*/

import db from "../../db.js";

/*
====================================================
UTILS
====================================================
*/

function safe(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function extractSignals(text = "") {
  const t = safe(text);

  return {
    isLaptop: t.includes("laptop") || t.includes("computadora") || t.includes("pc"),
    isPrinter: t.includes("impresora"),
    isMonitor: t.includes("monitor"),

    brand:
      t.includes("dell") ? "dell" :
      t.includes("hp") ? "hp" :
      t.includes("lenovo") ? "lenovo" :
      null,
  };
}

/*
====================================================
SEARCH CATALOG (SMART — FIXED)
====================================================
*/

export async function searchCatalogSmart({
  organization_id,
  text = "",
}) {
  try {
    if (!organization_id) return [];

    const signals = extractSignals(text);

    const result = await db.query(
      `
      SELECT *
      FROM product_catalog
      WHERE organization_id = $1
      AND is_active = true
      ORDER BY created_at DESC
      LIMIT 50
      `,
      [organization_id]
    );

    let products = result.rows || [];

    /*
    ========================================
    FILTRO POR CATEGORÍA
    ========================================
    */

    if (signals.isLaptop) {
      products = products.filter(p =>
        safe(p.name).includes("laptop") ||
        safe(p.name).includes("thinkpad") ||
        safe(p.name).includes("latitude")
      );
    }

    if (signals.isPrinter) {
      products = products.filter(p =>
        safe(p.name).includes("impresora")
      );
    }

    if (signals.isMonitor) {
      products = products.filter(p =>
        safe(p.name).includes("monitor")
      );
    }

    /*
    ========================================
    FILTRO POR MARCA
    ========================================
    */

    if (signals.brand) {
      products = products.filter(p =>
        safe(p.name).includes(signals.brand)
      );
    }

    /*
    ========================================
    FALLBACK CONTROLADO (NO CROSS-CATEGORY)
    ========================================
    */

    if (products.length === 0) {
      if (signals.isLaptop) {
        products = result.rows.filter(p =>
          safe(p.name).includes("laptop") ||
          safe(p.name).includes("thinkpad") ||
          safe(p.name).includes("latitude")
        );
      }
    }

    return products.slice(0, 3);

  } catch (error) {
    console.error("❌ searchCatalogSmart error:", error);
    return [];
  }
}

export const searchCatalog = searchCatalogSmart;

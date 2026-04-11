/*
====================================================
EVA CORE — CATALOG ENGINE (SOURCE OF TRUTH)
====================================================
*/

import db from "../../db.js";

/*
====================================================
SEARCH CATALOG (SMART)
====================================================
*/

export async function searchCatalogSmart({
  organization_id,
  text = "",
}) {
  try {
    if (!organization_id) return [];

    const query = String(text || "").toLowerCase();

    const result = await db.query(
      `
      SELECT *
      FROM product_catalog
      WHERE organization_id = $1
      AND is_active = true
      ORDER BY created_at DESC
      LIMIT 20
      `,
      [organization_id]
    );

    let products = result.rows || [];

    /*
    ========================================
    FILTRO POR TEXTO
    ========================================
    */

    if (query) {
      products = products.filter((p) => {
        const name = String(p.name || "").toLowerCase();
        const desc = String(p.description || "").toLowerCase();

        return name.includes(query) || desc.includes(query);
      });
    }

    /*
    ========================================
    FALLBACK
    ========================================
    */

    if (products.length === 0) {
      products = result.rows.slice(0, 5);
    }

    return products.slice(0, 5);
  } catch (error) {
    console.error("❌ searchCatalogSmart error:", error);
    return [];
  }
}

/*
====================================================
COMPATIBILITY EXPORT
====================================================
*/

export const searchCatalog = searchCatalogSmart;

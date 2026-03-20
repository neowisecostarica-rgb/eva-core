/*
====================================================
EVA CATALOG ENGINE (SMART SEARCH FIX)
====================================================
*/

import pool from "../../db.js";

function normalizeSearchText(text = "") {
  const lower = text.toLowerCase();

  const stopwords = [
    "tienen",
    "tiene",
    "hola",
    "buenas",
    "precio",
    "cuanto",
    "vale",
    "me",
    "puedes",
    "dar",
    "informacion",
    "info",
    "quiero",
    "busco",
    "algo",
    "en",
    "una",
    "un",
    "para"
  ];

  let cleaned = lower;

  stopwords.forEach(word => {
    cleaned = cleaned.replaceAll(word, "");
  });

  // quitar signos como ?
  cleaned = cleaned.replace(/[^\w\s]/gi, "");

  // limpiar espacios
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // tomar palabra clave principal
  const words = cleaned.split(" ").filter(Boolean);

  return words[0] || "";
}
====================================================
SEARCH
====================================================
*/

export async function searchCatalog({ organization_id, text }) {

  if (!organization_id || !text) {
    return [];
  }

  try {

    const cleanText = normalizeSearchText(text);

    console.log("🔍 SEARCH ORIGINAL:", text);
    console.log("🔍 SEARCH CLEAN:", cleanText);

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        description,
        price_crc,
        image_urls
      FROM product_catalog
      WHERE organization_id = $1
      AND is_active = true
      AND (
        name ILIKE '%' || $2 || '%'
        OR description ILIKE '%' || $2 || '%'
        OR category ILIKE '%' || $2 || '%'
      )
      ORDER BY name ASC
      LIMIT 5
      `,
      [organization_id, cleanText]
    );

    return result.rows || [];

  } catch (err) {

    console.error("catalog search error", err.message);

    return [];

  }

}

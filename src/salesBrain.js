import pool from "./db.js";
import { searchCatalog } from "./catalog.js";

export async function handleInbound({ organization_id, phone, message }) {

  let intent = "INFO";
  let stage = "DISCOVERY";

  const text = message.toLowerCase();

  if (text.includes("precio") || text.includes("cuesta")) {
    intent = "BUY";
  }

  if (text.includes("laptop") || text.includes("thinkpad")) {
    intent = "BUY";
  }

  let catalog = [];

  if (intent === "BUY") {
    catalog = await searchCatalog({
      organization_id,
      text
    });
  }

  let reply = "¡Genial! Cuéntame un poco más para recomendarte la mejor opción 🙂";

  if (catalog.length > 0) {

    const suggestions = catalog
      .map(p => `💻 ${p.name}\n💰 ₡${p.price_crc}`)
      .join("\n\n");

    reply = `Tengo estas opciones que funcionan muy bien 👇

${suggestions}

¿La necesitas principalmente para estudio, trabajo o ambas cosas?`;
  }

  await pool.query(
    `
    INSERT INTO eva_execution_log
    (organization_id, phone, intent, stage, reply)
    VALUES ($1,$2,$3,$4,$5)
  `,
    [organization_id, phone, intent, stage, reply]
  );

  return {
    reply,
    intent,
    stage,
    catalog_matches: catalog
  };
}

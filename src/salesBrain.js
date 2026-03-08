import pool from "./db.js";
import { searchCatalog } from "./catalog.js";

/*
FOLLOWUP CREATION
*/

async function createFollowup({ organization_id, phone }) {

  const existing = await pool.query(
    `
    SELECT id
    FROM followups
    WHERE organization_id = $1
    AND lead_phone = $2
    AND status = 'pending'
    LIMIT 1
    `,
    [organization_id, phone]
  );

  if (existing.rows.length > 0) return;

  const due = new Date(Date.now() + 30 * 60 * 1000);

  await pool.query(
    `
    INSERT INTO followups
    (organization_id, lead_phone, due_at, status, reason)
    VALUES ($1,$2,$3,'pending','no_response')
    `,
    [organization_id, phone, due]
  );

}

/*
MAIN ENGINE
*/

export async function handleInbound({ organization_id, phone, message }) {

  const text = message.toLowerCase();

  let intent = "INFO";

  if (
    text.includes("precio") ||
    text.includes("cuesta") ||
    text.includes("laptop") ||
    text.includes("computadora") ||
    text.includes("thinkpad")
  ) {
    intent = "BUY";
  }

  /*
  OBJECTION DETECTION
  */

  let objection = null;

  if (text.includes("caro") || text.includes("muy caro")) {
    objection = "PRICE";
  }

  if (text.includes("pensarlo") || text.includes("déjame pensarlo")) {
    objection = "THINK";
  }

  if (text.includes("no estoy seguro") || text.includes("no sé")) {
    objection = "UNSURE";
  }

  /*
  LEAD INTELLIGENCE
  */

  let budget = null;
  let use_case = null;
  let urgency = false;

  const budgetMatch = text.match(/(\d{3,6})/);

  if (budgetMatch) {
    budget = parseInt(budgetMatch[1]);
  }

  if (
    text.includes("estudio") ||
    text.includes("universidad") ||
    text.includes("colegio")
  ) {
    use_case = "study";
  }

  if (
    text.includes("trabajo") ||
    text.includes("oficina")
  ) {
    use_case = "work";
  }

  if (
    text.includes("hoy") ||
    text.includes("urgente") ||
    text.includes("ya")
  ) {
    urgency = true;
  }

  /*
  LEAD SCORING
  */

  let score = 40;

  if (budget) score += 20;
  if (use_case) score += 20;
  if (urgency) score += 20;

  let stage = "DISCOVERY";

  if (score >= 80) {
    stage = "HOT_BUYER";
  }

  /*
  CATALOG SEARCH
  */

  let catalog = [];

  if (intent === "BUY") {

    catalog = await searchCatalog({
      organization_id,
      text
    });

  }

  /*
  RESPONSE GENERATION
  */

  let reply =
    "¡Genial! Cuéntame un poco más para recomendarte la mejor opción 🙂";

  /*
  OBJECTION RESPONSES
  */

  if (objection === "PRICE") {

    reply = `Lo entiendo 👍

Estas laptops son línea corporativa, por eso duran más que una laptop normal.

Además incluyen 1 año de garantía.

Muchos estudiantes las prefieren por eso.

Si quieres puedo apartarte una unidad mientras decides.`;

  }

  if (objection === "THINK") {

    reply = `¡Claro! Tómate tu tiempo 👍

Solo te comento que las unidades que tenemos suelen agotarse rápido.

Si quieres puedo apartarte una mientras decides.`;

  }

  if (objection === "UNSURE") {

    reply = `No hay problema 👍

Si me cuentas para qué la necesitas exactamente puedo ayudarte a elegir la mejor opción.`;

  }

  /*
  PRODUCT RECOMMENDATION
  */

  if (catalog.length > 0 && !objection) {

    const p = catalog[0];

    if (stage === "HOT_BUYER") {

      reply = `Perfecto 👍 con ese presupuesto te puedo recomendar esta opción.

💻 ${p.name}
💰 ₡${p.price_crc}

Es una laptop corporativa muy confiable para ${
        use_case === "study" ? "estudio" : "trabajo"
      }.

Tenemos unidades disponibles.
¿Te gustaría apartarla?`;

    } else {

      reply = `Tengo estas opciones que funcionan muy bien 👇

💻 ${p.name}
💰 ₡${p.price_crc}

¿La necesitas principalmente para estudio, trabajo o ambas cosas?`;

    }

  }

  /*
  EXECUTION LOG
  */

  await pool.query(
    `
    INSERT INTO eva_execution_log
    (organization_id, phone, intent, stage, reply)
    VALUES ($1,$2,$3,$4,$5)
    `,
    [organization_id, phone, intent, stage, reply]
  );

  /*
  FOLLOWUP CREATION
  */

  await createFollowup({
    organization_id,
    phone
  });

  return {
    reply,
    intent,
    stage,
    lead_score: score,
    catalog_matches: catalog
  };

}

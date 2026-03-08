import pool from "./db.js";
import { searchCatalog } from "./catalog.js";

function detectIntent(text) {

  const buyWords = [
    "precio",
    "cuesta",
    "vale",
    "laptop",
    "computadora",
    "pc",
    "equipo",
    "thinkpad",
    "dell",
    "lenovo",
    "busco",
    "necesito",
    "ocupo",
    "quiero"
  ];

  return buyWords.some(w => text.includes(w)) ? "BUY" : "INFO";
}

function detectUseCase(text) {

  if (
    text.includes("estudio") ||
    text.includes("colegio") ||
    text.includes("escuela") ||
    text.includes("universidad")
  ) {
    return "study";
  }

  if (
    text.includes("trabajo") ||
    text.includes("oficina") ||
    text.includes("empresa")
  ) {
    return "work";
  }

  return null;
}

function detectBudget(text) {

  const match = text.match(/(\d{2,6})/);

  if (!match) return null;

  const value = parseInt(match[1]);

  if (value < 1000) return null;

  return value;
}

function detectUrgency(text) {

  if (
    text.includes("hoy") ||
    text.includes("urgente") ||
    text.includes("ya")
  ) {
    return "high";
  }

  if (
    text.includes("mañana") ||
    text.includes("pronto")
  ) {
    return "medium";
  }

  return null;
}

function calculateLeadScore({ use_case, budget, urgency }) {

  let score = 10;

  if (use_case) score += 20;

  if (budget) score += 30;

  if (urgency === "medium") score += 20;

  if (urgency === "high") score += 40;

  if (score > 100) score = 100;

  return score;
}

async function getLead(organization_id, phone) {

  const result = await pool.query(
    `
    SELECT *
    FROM leads
    WHERE organization_id = $1
    AND phone = $2
    LIMIT 1
    `,
    [organization_id, phone]
  );

  return result.rows[0] || null;
}

async function updateLead({
  organization_id,
  phone,
  use_case,
  budget,
  urgency,
  lead_score
}) {

  await pool.query(
    `
    UPDATE leads
    SET
      use_case = COALESCE($1, use_case),
      budget_crc = COALESCE($2, budget_crc),
      urgency_level = COALESCE($3, urgency_level),
      lead_score = $4,
      updated_at = NOW()
    WHERE organization_id = $5
    AND phone = $6
    `,
    [use_case, budget, urgency, lead_score, organization_id, phone]
  );
}

export async function handleInbound({ organization_id, phone, message }) {

  const text = message.toLowerCase().trim();

  const intent = detectIntent(text);

  let stage = "DISCOVERY";

  const use_case = detectUseCase(text);

  const budget = detectBudget(text);

  const urgency = detectUrgency(text);

  const lead = await getLead(organization_id, phone);

  const finalUseCase = use_case || lead?.use_case;

  const finalBudget = budget || lead?.budget_crc;

  const finalUrgency = urgency || lead?.urgency_level;

  const leadScore = calculateLeadScore({
    use_case: finalUseCase,
    budget: finalBudget,
    urgency: finalUrgency
  });

  await updateLead({
    organization_id,
    phone,
    use_case,
    budget,
    urgency,
    lead_score: leadScore
  });

  let catalog = [];

  if (intent === "BUY" || finalUseCase) {
    catalog = await searchCatalog({
      organization_id,
      text
    });
  }

  let reply = "¡Genial! Cuéntame un poco más para recomendarte la mejor opción 🙂";

  if (catalog.length > 0 && finalUseCase) {

    const p = catalog[0];

    reply = `Perfecto 👍 para ${finalUseCase === "study" ? "estudio" : "trabajo"} te recomiendo esta opción:

💻 ${p.name}
💰 ₡${p.price_crc}

¿Tienes algún presupuesto aproximado en mente?`;

    stage = "QUALIFYING";

  } else if (catalog.length > 0) {

    const list = catalog
      .map(p => `💻 ${p.name}\n💰 ₡${p.price_crc}`)
      .join("\n\n");

    reply = `Tengo estas opciones que funcionan muy bien 👇

${list}

¿La necesitas principalmente para estudio, trabajo o ambas cosas?`;

    stage = "QUALIFYING";

  } else if (finalBudget) {

    reply = `Perfecto 👍 con un presupuesto de aproximadamente ₡${finalBudget} puedo buscarte una buena opción.

¿La necesitas para estudio o trabajo?`;

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
    lead_score: leadScore,
    catalog_matches: catalog
  };
}

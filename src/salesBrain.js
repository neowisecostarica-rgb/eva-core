import pool from "./db.js";
import { searchCatalog } from "./catalog.js";

function detectIntent(text) {
  const buyKeywords = [
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
    "disponible",
    "tienen",
    "busco",
    "ocupo",
    "necesito",
    "quiero"
  ];

  const matched = buyKeywords.some(keyword => text.includes(keyword));
  return matched ? "BUY" : "INFO";
}

function detectUseCase(text) {
  const hasStudy =
    text.includes("estudio") ||
    text.includes("estudiar") ||
    text.includes("colegio") ||
    text.includes("escuela") ||
    text.includes("universidad") ||
    text.includes("clases") ||
    text.includes("tareas");

  const hasWork =
    text.includes("trabajo") ||
    text.includes("oficina") ||
    text.includes("excel") ||
    text.includes("empresa") ||
    text.includes("office");

  if (hasStudy && hasWork) return "mixed";
  if (hasStudy) return "study";
  if (hasWork) return "work";

  return null;
}

async function getLeadContext({ organization_id, phone }) {
  const result = await pool.query(
    `
    SELECT id, use_case
    FROM leads
    WHERE organization_id = $1
      AND phone = $2
    LIMIT 1
    `,
    [organization_id, phone]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

async function saveUseCase({ organization_id, phone, use_case }) {
  await pool.query(
    `
    UPDATE leads
    SET use_case = $1,
        updated_at = NOW()
    WHERE organization_id = $2
      AND phone = $3
    `,
    [use_case, organization_id, phone]
  );
}

async function logExecution({
  organization_id,
  phone,
  intent,
  stage,
  reply
}) {
  await pool.query(
    `
    INSERT INTO eva_execution_log
    (organization_id, phone, intent, stage, reply)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [organization_id, phone, intent, stage, reply]
  );
}

function buildCatalogSuggestions(catalog) {
  return catalog
    .map(product => `💻 ${product.name}\n💰 ₡${product.price_crc}`)
    .join("\n\n");
}

function buildUseCaseReply({ use_case, product }) {
  if (use_case === "study") {
    return `Perfecto 👍 para estudio te recomiendo más esta opción:

💻 ${product.name}
💰 ₡${product.price_crc}

Es una laptop corporativa resistente y práctica, ideal para clases, tareas y uso académico.`;
  }

  if (use_case === "work") {
    return `Perfecto 👍 para trabajo te recomiendo más esta opción:

💻 ${product.name}
💰 ₡${product.price_crc}

Es una muy buena alternativa para oficina y uso profesional, con enfoque más corporativo.`;
  }

  if (use_case === "mixed") {
    return `Perfecto 👍 si la necesitas para estudio y trabajo, esta opción te puede funcionar muy bien:

💻 ${product.name}
💰 ₡${product.price_crc}

Te da un equilibrio bastante bueno para tareas, clases, documentos y uso diario.`;
  }

  return null;
}

export async function handleInbound({ organization_id, phone, message }) {
  const text = message.toLowerCase().trim();

  let intent = detectIntent(text);
  let stage = "DISCOVERY";

  const detectedUseCase = detectUseCase(text);
  const leadContext = await getLeadContext({ organization_id, phone });
  const existingUseCase = leadContext?.use_case || null;

  if (detectedUseCase) {
    await saveUseCase({
      organization_id,
      phone,
      use_case: detectedUseCase
    });
  }

  const finalUseCase = detectedUseCase || existingUseCase;

  let catalog = [];

  if (intent === "BUY" || finalUseCase) {
    catalog = await searchCatalog({
      organization_id,
      text
    });
  }

  let reply = "¡Genial! Cuéntame un poco más para recomendarte la mejor opción 🙂";

  if (catalog.length > 0 && finalUseCase) {
    const preferredProduct = catalog[0];
    const contextualReply = buildUseCaseReply({
      use_case: finalUseCase,
      product: preferredProduct
    });

    if (contextualReply) {
      reply = contextualReply;
      stage = "QUALIFYING";
    }
  } else if (catalog.length > 0) {
    const suggestions = buildCatalogSuggestions(catalog);

    reply = `Tengo estas opciones que funcionan muy bien 👇

${suggestions}

¿La necesitas principalmente para estudio, trabajo o ambas cosas?`;

    stage = "QUALIFYING";
  } else if (finalUseCase) {
    reply = "Perfecto 👍 ya entendí mejor lo que necesitas. ¿Tienes algún presupuesto aproximado en mente para recomendarte mejor?";
    stage = "QUALIFYING";
  }

  await logExecution({
    organization_id,
    phone,
    intent,
    stage,
    reply
  });

  return {
    reply,
    intent,
    stage,
    catalog_matches: catalog
  };
}

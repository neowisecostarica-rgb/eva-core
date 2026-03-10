import pool from "./db.js";

// ============================================================
// EVA Core - salesBrain.js
// Bundle Quirúrgico v9.1
// FIXES:
// - Corrige duplicate updated_at en UPDATEs
// - Mantiene leads como fuente de verdad
// - Conversaciones por organization_id + channel + external_user_id
// - Pipeline events usando event_data / from_stage / to_stage / lead_phone
// - Followups consistentes con due_at + scheduled_for
// - Execution log en eva_execution_log
// - Customer memory usando customer_profiles.profile_json
// - Catálogo contextual
// - Idempotencia inbound
// - Transacción atómica
// ============================================================

const tableColumnsCache = new Map();

// ------------------------------------------------------------
// Utilidades base
// ------------------------------------------------------------
function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function compactObject(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  );
}

function now() {
  return new Date();
}

async function dbQuery(runner, sql, params = []) {
  return runner.query(sql, params);
}

async function getTableColumns(tableName, runner = pool) {
  if (tableColumnsCache.has(tableName)) {
    return tableColumnsCache.get(tableName);
  }

  const result = await dbQuery(
    runner,
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
    ORDER BY ordinal_position
    `,
    [tableName]
  );

  const columns = new Set(result.rows.map((row) => row.column_name));
  tableColumnsCache.set(tableName, columns);
  return columns;
}

async function insertFlexible(tableName, candidateValues, runner = pool) {
  const columns = await getTableColumns(tableName, runner);

  const entries = Object.entries(candidateValues).filter(
    ([key, value]) => columns.has(key) && value !== undefined
  );

  if (entries.length === 0) {
    return null;
  }

  const fieldNames = entries.map(([key]) => key);
  const values = entries.map(([, value]) => value);
  const placeholders = entries.map((_, i) => `$${i + 1}`);

  const sql = `
    INSERT INTO ${tableName} (${fieldNames.join(", ")})
    VALUES (${placeholders.join(", ")})
    RETURNING *
  `;

  const result = await dbQuery(runner, sql, values);
  return result.rows[0] || null;
}

async function updateFlexible(
  tableName,
  whereClause,
  whereValues,
  candidateValues,
  runner = pool
) {
  const columns = await getTableColumns(tableName, runner);

  const normalizedCandidateValues = { ...candidateValues };

  // Evita doble asignación de updated_at
  if (columns.has("updated_at")) {
    delete normalizedCandidateValues.updated_at;
  }

  const entries = Object.entries(normalizedCandidateValues).filter(
    ([key, value]) => columns.has(key) && value !== undefined
  );

  const sets = entries.map(([key], i) => `${key} = $${i + 1}`);
  const values = entries.map(([, value]) => value);

  if (columns.has("updated_at")) {
    sets.push(`updated_at = NOW()`);
  }

  if (sets.length === 0) {
    return null;
  }

  const sql = `
    UPDATE ${tableName}
    SET ${sets.join(", ")}
    WHERE ${whereClause}
    RETURNING *
  `;

  const result = await dbQuery(runner, sql, [...values, ...whereValues]);
  return result.rows[0] || null;
}

// ------------------------------------------------------------
// Detección comercial
// ------------------------------------------------------------
function detectBudgetCRC(text) {
  const normalized = normalizeText(text);

  const patterns = [
    /(?:tengo|manejo|presupuesto|cuento con|anda por|como de)\s+(?:unos?\s+)?(?:crc\s*)?(?:₡\s*)?(\d{2,3})(?:\s*(mil|miles))/i,
    /(?:tengo|manejo|presupuesto|cuento con|anda por|como de)\s+(?:unos?\s+)?(?:crc\s*)?(?:₡\s*)?(\d{4,9})/i,
    /(?:₡\s*|crc\s*)(\d{2,3})(?:\s*(mil|miles))/i,
    /(?:₡\s*|crc\s*)(\d{4,9})/i,
    /\b(\d{2,3})\s*(mil|miles)\b/i,
    /\b(\d{5,9})\b/
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;

    let amount = safeNumber(match[1]);
    if (!amount) continue;

    if (match[2] && /mil|miles/i.test(match[2])) {
      amount *= 1000;
    }

    if (amount >= 10000 && amount <= 5000000) {
      return amount;
    }
  }

  return null;
}

function detectUseCase(text) {
  const normalized = normalizeText(text);

  if (
    /(ingenieria|ingeniería|diseno|diseño|arquitectura|render|edicion|edición|programacion|programación|desarrollo)/i.test(
      normalized
    )
  ) {
    return "advanced_work";
  }

  if (/(excel|oficina|trabajo|teletrabajo|empresa|administrativo)/i.test(normalized)) {
    return "work";
  }

  if (/(estudio|estudiar|universidad|colegio|escuela|clases|tareas)/i.test(normalized)) {
    return "study";
  }

  if (/(ninos|niños|niño|niña|primaria)/i.test(normalized)) {
    return "school";
  }

  return null;
}

function detectProductInterest(text) {
  const normalized = normalizeText(text);

  const dictionary = [
    "thinkpad",
    "lenovo",
    "dell",
    "latitude",
    "hp",
    "elitebook",
    "probook",
    "laptop",
    "computadora",
    "pc",
    "monitor"
  ];

  for (const item of dictionary) {
    if (normalized.includes(item)) return item;
  }

  return null;
}

function detectIntent(text) {
  const normalized = normalizeText(text);

  if (!normalized) {
    return {
      intent: "UNKNOWN",
      stage: "DISCOVERY",
      lead_score: 0,
      objection_type: null
    };
  }

  const objectionPatterns = [
    "caro",
    "cara",
    "muy caro",
    "muy cara",
    "esta caro",
    "esta cara",
    "está caro",
    "está cara",
    "mucho dinero",
    "se sale del presupuesto"
  ];

  const closingPatterns = [
    "me gusta",
    "la quiero",
    "lo quiero",
    "me interesa esa",
    "quiero esa",
    "me llevo",
    "la compro",
    "lo compro",
    "como hago para comprar",
    "como la aparto",
    "como lo aparto",
    "apartarla",
    "apartarlo",
    "todavia la tiene",
    "todavía la tiene",
    "puedo pasar hoy",
    "esta disponible",
    "está disponible"
  ];

  const comparePatterns = [
    "cual me recomienda",
    "cual recomiendas",
    "que me recomiendas",
    "qué me recomiendas",
    "comparar",
    "diferencia",
    "mejor opcion",
    "mejor opción"
  ];

  const pricePatterns = [
    "precio",
    "cuanto cuesta",
    "cuánto cuesta",
    "cuanto vale",
    "cuánto vale",
    "en cuanto",
    "en cuánto"
  ];

  const greetingPatterns = [
    "hola",
    "buenas",
    "buenos dias",
    "buenos días",
    "buenas tardes",
    "buenas noches"
  ];

  const supportPatterns = [
    "garantia",
    "garantía",
    "soporte",
    "servicio tecnico",
    "servicio técnico",
    "reparacion",
    "reparación"
  ];

  if (objectionPatterns.some((p) => normalized.includes(p))) {
    return {
      intent: "OBJECTION",
      stage: "NEGOTIATION",
      lead_score: 72,
      objection_type: "PRICE"
    };
  }

  if (closingPatterns.some((p) => normalized.includes(p))) {
    return {
      intent: "CLOSING",
      stage: "CLOSING",
      lead_score: 92,
      objection_type: null
    };
  }

  if (comparePatterns.some((p) => normalized.includes(p))) {
    return {
      intent: "COMPARE",
      stage: "QUALIFYING",
      lead_score: 55,
      objection_type: null
    };
  }

  if (pricePatterns.some((p) => normalized.includes(p))) {
    return {
      intent: "PRICE",
      stage: "OFFER",
      lead_score: 40,
      objection_type: null
    };
  }

  if (supportPatterns.some((p) => normalized.includes(p))) {
    return {
      intent: "SUPPORT",
      stage: "DISCOVERY",
      lead_score: 20,
      objection_type: null
    };
  }

  const buySignals = [
    "busco",
    "quiero",
    "tienen",
    "ando buscando",
    "ocupo",
    "necesito",
    "andan",
    "disponible"
  ];

  if (buySignals.some((p) => normalized.includes(p))) {
    return {
      intent: "BUY",
      stage: "QUALIFYING",
      lead_score: 60,
      objection_type: null
    };
  }

  if (greetingPatterns.some((p) => normalized.includes(p))) {
    return {
      intent: "GREETING",
      stage: "DISCOVERY",
      lead_score: 10,
      objection_type: null
    };
  }

  return {
    intent: "INFO",
    stage: "DISCOVERY",
    lead_score: 20,
    objection_type: null
  };
}

// ------------------------------------------------------------
// Catálogo inteligente
// ------------------------------------------------------------
function extractSearchTerms(text, productInterest, useCase) {
  const normalized = normalizeText(text);

  const baseTerms = normalized
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3);

  const businessTerms = [
    "thinkpad",
    "lenovo",
    "dell",
    "latitude",
    "elitebook",
    "probook",
    "laptop",
    "computadora",
    "pc",
    "excel",
    "oficina",
    "estudio",
    "trabajo",
    "ingenieria",
    "ingeniería",
    "monitor"
  ];

  const matchedBusinessTerms = businessTerms.filter((term) =>
    normalized.includes(normalizeText(term))
  );

  return unique([
    ...(productInterest ? [productInterest] : []),
    ...(useCase ? [useCase] : []),
    ...matchedBusinessTerms,
    ...baseTerms
  ]).slice(0, 10);
}

function scoreCatalogRow(row, text, budgetCRC, useCase, productInterest) {
  const haystack = normalizeText(
    [row.name, row.category, row.description].filter(Boolean).join(" ")
  );

  let score = 0;

  if (productInterest && haystack.includes(normalizeText(productInterest))) {
    score += 35;
  }

  if (haystack.includes("thinkpad")) score += 12;
  if (haystack.includes("latitude")) score += 10;
  if (haystack.includes("elitebook")) score += 9;
  if (haystack.includes("probook")) score += 8;

  if (useCase === "study" && /(estudio|escuela|colegio|universidad)/i.test(haystack)) {
    score += 15;
  }

  if (useCase === "work" && /(trabajo|oficina|excel|empresa)/i.test(haystack)) {
    score += 15;
  }

  if (useCase === "advanced_work" && /(i7|ryzen 7|16gb|ssd|workstation)/i.test(haystack)) {
    score += 15;
  }

  const normalizedText = normalizeText(text);
  const terms = extractSearchTerms(normalizedText, productInterest, useCase);

  for (const term of terms) {
    if (haystack.includes(normalizeText(term))) {
      score += 8;
    }
  }

  const price = safeNumber(row.price_crc);

  if (budgetCRC && price) {
    if (price <= budgetCRC) {
      score += 30;
      const delta = budgetCRC - price;
      if (delta <= 20000) score += 10;
    } else {
      const overshoot = price - budgetCRC;
      if (overshoot <= 25000) score += 5;
      else if (overshoot <= 50000) score -= 10;
      else score -= 25;
    }
  }

  const stock = safeNumber(row.stock);
  if (stock !== null) {
    if (stock > 0) score += 10;
    else score -= 20;
  }

  return score;
}

async function searchCatalogSmart(
  { organization_id, text, budgetCRC, useCase, productInterest },
  runner = pool
) {
  const terms = extractSearchTerms(text, productInterest, useCase);

  const likeClauses = [];
  const values = [organization_id];

  let index = 2;
  for (const term of terms) {
    const pattern = `%${normalizeText(term)}%`;
    likeClauses.push(`(
      LOWER(COALESCE(p.name, '')) LIKE $${index}
      OR LOWER(COALESCE(p.category, '')) LIKE $${index}
      OR LOWER(COALESCE(p.description, '')) LIKE $${index}
    )`);
    values.push(pattern);
    index += 1;
  }

  const budgetFilter = budgetCRC
    ? `AND (p.price_crc IS NULL OR p.price_crc <= $${index})`
    : "";

  if (budgetCRC) values.push(budgetCRC);

  const sql = `
    SELECT
      p.id,
      p.name,
      p.category,
      p.description,
      p.price_crc,
      p.stock,
      p.is_active,
      p.updated_at,
      (
        SELECT pa.url
        FROM product_assets pa
        WHERE pa.product_id = p.id
        ORDER BY pa.sort_order ASC NULLS LAST, pa.created_at ASC
        LIMIT 1
      ) AS image
    FROM product_catalog p
    WHERE p.organization_id = $1
      AND (${likeClauses.length > 0 ? likeClauses.join(" OR ") : "TRUE"})
      AND (p.is_active IS NULL OR p.is_active = true)
      ${budgetFilter}
    ORDER BY p.updated_at DESC NULLS LAST, p.name ASC
    LIMIT 12
  `;

  try {
    const result = await dbQuery(runner, sql, values);

    return result.rows
      .map((row) => ({
        ...row,
        _score: scoreCatalogRow(row, text, budgetCRC, useCase, productInterest)
      }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 3)
      .map(({ _score, ...row }) => row);
  } catch (err) {
    console.error("searchCatalogSmart error", err.message);
    return [];
  }
}

// ------------------------------------------------------------
// Respuestas comerciales
// ------------------------------------------------------------
function formatCRC(value) {
  const amount = safeNumber(value);
  if (!amount) return null;
  return `₡${amount.toLocaleString("es-CR")}`;
}

function buildCatalogReply(catalogMatches, budgetCRC) {
  let reply = "Te puedo recomendar estas opciones:\n\n";

  for (const p of catalogMatches) {
    const price = formatCRC(p.price_crc) || "Consultar";
    reply += `💻 ${p.name} — ${price}\n`;
  }

  if (budgetCRC) {
    reply += `\nTomé en cuenta un presupuesto cercano a ${formatCRC(budgetCRC)}.`;
  }

  reply += "\n\n¿Te gustaría ver fotos o más detalles de alguno?";
  return reply;
}

function buildBudgetReply(budgetCRC) {
  return `Perfecto 👍 con un presupuesto cercano a ${formatCRC(budgetCRC)} te puedo recomendar opciones que sí valgan la pena. ¿La necesitas para estudio, trabajo o algo más exigente?`;
}

function buildObjectionReply(catalogMatches = []) {
  const top = catalogMatches[0];

  if (top?.name && top?.price_crc) {
    return `Entiendo 👍\n\nLa ${top.name} en ${formatCRC(top.price_crc)} suele gustar mucho porque es línea corporativa, más resistente que muchas laptops domésticas y normalmente ofrece mejor durabilidad.\n\nSi quieres, te puedo mostrar una alternativa un poco más económica o enviarte fotos reales de esta.`;
  }

  return "Entiendo 👍 estas opciones suelen ser línea corporativa, más resistentes y pensadas para durar más que muchas laptops domésticas. Si quieres, te enseño una opción más económica o una con mejor valor según tu presupuesto.";
}

function buildClosingReply(catalogMatches = []) {
  const top = catalogMatches[0];

  if (top?.name && top?.price_crc) {
    return `Perfecto 👍\n\nLa ${top.name} está en ${formatCRC(top.price_crc)}.\n\nSi quieres, se puede apartar con ₡20.000 para asegurarte la unidad. ¿Quieres que te explique cómo apartarla o prefieres ver fotos reales primero?`;
  }

  return "Perfecto 👍 si ya tienes una opción en mente, se puede apartar con ₡20.000 para asegurarte la unidad. ¿Quieres que te explique cómo funciona el apartado?";
}

function buildSupportReply() {
  return "Claro 👍 te ayudo con gusto. Cuéntame un poco más sobre lo que necesitas y te doy la información más útil posible.";
}

function buildGreetingReply() {
  return "Hola 👋 con gusto te ayudo. Cuéntame qué tipo de equipo buscas y para qué lo necesitas.";
}

function buildFallbackReply() {
  return "Perfecto 👍 te puedo ayudar a encontrar una buena opción. ¿La necesitas para estudio, trabajo o algo más exigente?";
}

// ------------------------------------------------------------
// Idempotencia / conversación
// ------------------------------------------------------------
async function findMessageByExternalId(
  organization_id,
  external_message_id,
  runner = pool
) {
  if (!external_message_id) return null;

  const columns = await getTableColumns("messages", runner);
  if (!columns.has("external_message_id")) return null;
  if (!columns.has("organization_id")) return null;

  const result = await dbQuery(
    runner,
    `
    SELECT *
    FROM messages
    WHERE organization_id = $1
      AND external_message_id = $2
    LIMIT 1
    `,
    [organization_id, external_message_id]
  );

  return result.rows[0] || null;
}

async function findLatestAssistantReply(conversation_id, runner = pool) {
  const result = await dbQuery(
    runner,
    `
    SELECT content, created_at
    FROM messages
    WHERE conversation_id = $1
      AND role = 'assistant'
    ORDER BY created_at DESC NULLS LAST, id DESC
    LIMIT 1
    `,
    [conversation_id]
  );

  return result.rows[0] || null;
}

async function ensureConversation(
  organization_id,
  phone,
  channel = "whatsapp",
  runner = pool
) {
  const columns = await getTableColumns("conversations", runner);
  const hasChannel = columns.has("channel");

  const sql = `
    SELECT *
    FROM conversations
    WHERE organization_id = $1
      AND external_user_id = $2
      ${hasChannel ? `AND channel = $3` : ""}
    ORDER BY created_at ASC NULLS LAST, id ASC
    LIMIT 1
  `;

  const params = hasChannel ? [organization_id, phone, channel] : [organization_id, phone];
  const result = await dbQuery(runner, sql, params);

  if (result.rows.length > 0) {
    return result.rows[0];
  }

  const created = await insertFlexible(
    "conversations",
    {
      organization_id,
      external_user_id: phone,
      channel,
      stage: "DISCOVERY",
      control_mode: "HYBRID",
      created_at: now(),
      updated_at: now()
    },
    runner
  );

  return created || null;
}

// ------------------------------------------------------------
// Memoria / Leads / Pipeline / Followups
// ------------------------------------------------------------
async function findLeadByPhone(organization_id, phone, runner = pool) {
  try {
    const result = await dbQuery(
      runner,
      `
      SELECT *
      FROM leads
      WHERE organization_id = $1
        AND phone = $2
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
      LIMIT 1
      `,
      [organization_id, phone]
    );

    return result.rows[0] || null;
  } catch (err) {
    console.error("findLeadByPhone error", err.message);
    return null;
  }
}

async function upsertLeadMemory(
  {
    organization_id,
    phone,
    channel,
    intent,
    stage,
    lead_score,
    budgetCRC,
    productInterest,
    useCase
  },
  runner = pool
) {
  try {
    const existing = await findLeadByPhone(organization_id, phone, runner);

    const interestLevel =
      lead_score >= 85 ? "HIGH" :
      lead_score >= 55 ? "MEDIUM" :
      "LOW";

    const payload = compactObject({
      organization_id,
      phone,
      source: channel,
      intent,
      stage,
      score: lead_score,
      budget: budgetCRC ? String(budgetCRC) : undefined,
      product_interest: productInterest,
      use_case: useCase,
      interest_level: interestLevel,
      last_contact_at: now()
    });

    if (existing?.id) {
      const updated = await updateFlexible(
        "leads",
        `id = $${Object.keys(payload).length + 1}`,
        [existing.id],
        payload,
        runner
      );
      return updated || existing;
    }

    const created = await insertFlexible(
      "leads",
      {
        ...payload,
        status: "OPEN",
        created_at: now(),
        updated_at: now()
      },
      runner
    );

    return created || null;
  } catch (err) {
    console.error("upsertLeadMemory error", err.message);
    return null;
  }
}

async function upsertCustomerProfile(
  { organization_id, phone, budgetCRC, productInterest, useCase, leadScore, intent, stage },
  runner = pool
) {
  try {
    const result = await dbQuery(
      runner,
      `
      SELECT *
      FROM customer_profiles
      WHERE organization_id = $1
        AND external_user_id = $2
      LIMIT 1
      `,
      [organization_id, phone]
    );

    const previous = result.rows[0]?.profile_json || {};

    const profileJson = {
      ...previous,
      phone,
      last_intent: intent,
      last_stage: stage,
      last_lead_score: leadScore,
      budget_crc: budgetCRC ?? previous.budget_crc ?? null,
      product_interest: productInterest ?? previous.product_interest ?? null,
      use_case: useCase ?? previous.use_case ?? null,
      updated_at: new Date().toISOString()
    };

    if (result.rows[0]?.id) {
      const updated = await updateFlexible(
        "customer_profiles",
        `id = $2`,
        [result.rows[0].id],
        {
          profile_json: profileJson
        },
        runner
      );
      return updated || result.rows[0];
    }

    const created = await insertFlexible(
      "customer_profiles",
      {
        organization_id,
        external_user_id: phone,
        profile_json: profileJson,
        created_at: now(),
        updated_at: now()
      },
      runner
    );

    return created || null;
  } catch (err) {
    if (err.message?.includes('relation "customer_profiles" does not exist')) {
      return null;
    }

    console.error("upsertCustomerProfile error", err.message);
    return null;
  }
}

async function createPipelineEvent(
  {
    organization_id,
    conversation_id,
    lead_phone,
    from_stage = null,
    to_stage = null,
    event_type,
    reason = null,
    event_data = {}
  },
  runner = pool
) {
  try {
    await insertFlexible(
      "pipeline_events",
      {
        organization_id,
        conversation_id,
        lead_phone,
        from_stage,
        to_stage,
        event_type,
        reason,
        event_data,
        created_at: now()
      },
      runner
    );
  } catch (err) {
    console.error("createPipelineEvent error", err.message);
  }
}

async function hasOpenSimilarFollowup(
  { organization_id, conversation_id, reason },
  runner = pool
) {
  try {
    const result = await dbQuery(
      runner,
      `
      SELECT id
      FROM followups
      WHERE organization_id = $1
        AND conversation_id = $2
        AND LOWER(status) IN ('pending', 'open')
        AND reason = $3
      LIMIT 1
      `,
      [organization_id, conversation_id, reason]
    );

    return result.rows.length > 0;
  } catch (err) {
    console.error("hasOpenSimilarFollowup error", err.message);
    return false;
  }
}

async function createFollowupIfNeeded(
  { organization_id, conversation_id, phone, intent, lead_score },
  runner = pool
) {
  if (lead_score < 55) return;

  const reason = `AUTO_${intent}`;

  const duplicated = await hasOpenSimilarFollowup(
    { organization_id, conversation_id, reason },
    runner
  );

  if (duplicated) return;

  const runAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await insertFlexible(
    "followups",
    {
      organization_id,
      conversation_id,
      lead_phone: phone,
      status: "pending",
      reason,
      scheduled_for: runAt,
      due_at: runAt,
      payload: {
        type: "sales_followup",
        intent,
        template:
          "Hola 🙂 solo quería saber si todavía sigues buscando equipo. Si quieres, te puedo compartir opciones que sí valen la pena."
      },
      created_at: now(),
      updated_at: now()
    },
    runner
  );
}

async function registerExecutionLog(
  {
    organization_id,
    phone,
    intent,
    stage,
    reply
  },
  runner = pool
) {
  try {
    await insertFlexible(
      "eva_execution_log",
      {
        organization_id,
        phone,
        intent,
        stage,
        reply,
        created_at: now()
      },
      runner
    );
  } catch (err) {
    console.error("registerExecutionLog error", err.message);
  }
}
async function updateConversationState(
  { conversation_id, stage, summary },
  runner = pool
) {
  try {
    await runner.query(
      `
      UPDATE conversations
      SET stage = $1,
          summary = $2,
          updated_at = NOW()
      WHERE id = $3
      `,
      [stage, summary, conversation_id]
    );
  } catch (err) {
    console.error("updateConversationState error", err.message);
  }
}
function buildConversationSummary({
  intent,
  stage,
  budgetCRC,
  productInterest,
  useCase
}) {
  const parts = [
    `intent=${intent}`,
    `stage=${stage}`
  ];

  if (budgetCRC) parts.push(`budget=${budgetCRC}`);
  if (productInterest) parts.push(`product=${productInterest}`);
  if (useCase) parts.push(`use_case=${useCase}`);

  return parts.join(" | ");
}

// ------------------------------------------------------------
// Motor principal
// ------------------------------------------------------------
export async function handleInbound({ organization_id, payload }) {
  const message = String(payload?.message || "").trim();
  const phone = String(payload?.phone || "unknown").replace(/\D/g, "") || "unknown";
  const channel = String(payload?.channel || "whatsapp").trim().toLowerCase();
  const external_message_id = payload?.external_message_id
    ? String(payload.external_message_id).trim()
    : null;

  const text = normalizeText(message);
  const { intent, stage, lead_score, objection_type } = detectIntent(text);
  const budgetCRC = detectBudgetCRC(text);
  const useCase = detectUseCase(text);
  const productInterest = detectProductInterest(text);

  let reply = buildFallbackReply();
  let catalogMatches = [];

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1) Idempotencia inbound
    if (external_message_id) {
      const existingInbound = await findMessageByExternalId(
        organization_id,
        external_message_id,
        client
      );

      if (existingInbound) {
        const priorReply = existingInbound.conversation_id
          ? await findLatestAssistantReply(existingInbound.conversation_id, client)
          : null;

        await client.query("COMMIT");

        return {
          ok: true,
          duplicate_ignored: true,
          conversation_id: existingInbound.conversation_id || null,
          reply: priorReply?.content || null,
          intent,
          stage,
          lead_score,
          data: {
            budget_crc: budgetCRC,
            product_interest: productInterest,
            use_case: useCase
          },
          catalog_matches: []
        };
      }
    }

    // 2) Conversación atómica por tenant + canal + usuario
    const conversation = await ensureConversation(
      organization_id,
      phone,
      channel,
      client
    );

    if (!conversation?.id) {
      throw new Error("conversation_not_created");
    }

    const conversation_id = conversation.id;
    const previousStage = conversation.stage || "DISCOVERY";

    // 3) Guardar inbound
    await insertFlexible(
      "messages",
      {
        organization_id,
        conversation_id,
        role: "user",
        content: message,
        external_message_id,
        meta: {
          channel
        },
        created_at: now()
      },
      client
    );

    // 4) Resolver motor comercial
    if (
      intent === "BUY" ||
      intent === "PRICE" ||
      intent === "COMPARE" ||
      intent === "CLOSING" ||
      intent === "OBJECTION"
    ) {
      catalogMatches = await searchCatalogSmart(
        {
          organization_id,
          text,
          budgetCRC,
          useCase,
          productInterest
        },
        client
      );
    }

   if (intent === "GREETING") {
  reply = buildGreetingReply();

} else if (intent === "BUY") {

  if (budgetCRC) {
    reply = `Perfecto 👍 con un presupuesto cercano a ${formatCRC(budgetCRC)} te puedo recomendar opciones que sí valgan la pena.\n\n¿La necesitas para estudio o para trabajo?`;
  } else {
    reply = "Perfecto 👍 te ayudo a encontrar una buena opción.\n\n¿La laptop la necesitas para estudio o para trabajo?";
  }

} else if (intent === "SUPPORT") {
  reply = buildSupportReply();

    // 5) Guardar assistant
    await insertFlexible(
      "messages",
      {
        organization_id,
        conversation_id,
        role: "assistant",
        content: reply,
        meta: {
          channel,
          intent,
          stage,
          lead_score
        },
        created_at: now()
      },
      client
    );

    // 6) Persistencia comercial
    const existingLeadBefore = await findLeadByPhone(organization_id, phone, client);

    const lead = await upsertLeadMemory(
      {
        organization_id,
        phone,
        channel,
        intent,
        stage,
        lead_score,
        budgetCRC,
        productInterest,
        useCase
      },
      client
    );

    await upsertCustomerProfile(
      {
        organization_id,
        phone,
        budgetCRC,
        productInterest,
        useCase,
        leadScore: lead_score,
        intent,
        stage
      },
      client
    );

    await updateConversationState(
      {
        conversation_id,
        stage,
        summary: buildConversationSummary({
          intent,
          stage,
          budgetCRC,
          productInterest,
          useCase
        })
      },
      client
    );

    if (!existingLeadBefore?.id) {
      await createPipelineEvent(
        {
          organization_id,
          conversation_id,
          lead_phone: phone,
          from_stage: null,
          to_stage: stage,
          event_type: "lead_created",
          reason: "first_inbound_message",
          event_data: {
            intent,
            lead_score
          }
        },
        client
      );
    }

    if (previousStage !== stage) {
      await createPipelineEvent(
        {
          organization_id,
          conversation_id,
          lead_phone: phone,
          from_stage: previousStage,
          to_stage: stage,
          event_type: "stage_changed",
          reason: "intent_detection",
          event_data: {
            intent,
            lead_score,
            budget_crc: budgetCRC,
            use_case: useCase,
            product_interest: productInterest
          }
        },
        client
      );
    }

    if (catalogMatches.length > 0) {
      await createPipelineEvent(
        {
          organization_id,
          conversation_id,
          lead_phone: phone,
          from_stage: stage,
          to_stage: stage,
          event_type: "offer_sent",
          reason: "catalog_match",
          event_data: {
            products: catalogMatches.map((p) => ({
              id: p.id,
              name: p.name,
              price_crc: p.price_crc
            }))
          }
        },
        client
      );
    }

    await createFollowupIfNeeded(
      {
        organization_id,
        conversation_id,
        phone,
        intent,
        lead_score
      },
      client
    );

    await registerExecutionLog(
      {
        organization_id,
        phone,
        intent,
        stage,
        reply
      },
      client
    );

    await client.query("COMMIT");

    return {
      ok: true,
      reply,
      intent,
      stage,
      lead_score,
      conversation_id,
      lead_id: lead?.id || null,
      duplicate_ignored: false,
      data: {
        budget_crc: budgetCRC,
        product_interest: productInterest,
        use_case: useCase
      },
      catalog_matches: catalogMatches
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      console.error("rollback error", rollbackErr);
    }

    console.error("salesBrain error", err);

    return {
      error: "brain_error"
    };
  } finally {
    client.release();
  }
}

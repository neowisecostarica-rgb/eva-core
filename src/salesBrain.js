// src/salesBrain.js
// EVA Sales Brain - Stable Core (Refactor P0/P1)

/* -------------------- TEXT UTILS -------------------- */

function normalizeText(input) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

/* -------------------- PIPELINE EVENTS -------------------- */

async function logPipelineEvent({
  db,
  organizationId,
  conversationId,
  phone,
  fromStage,
  toStage,
  eventType,
  reason = null
}) {
  if (!conversationId) return;

  try {
    await db.query(
      `INSERT INTO pipeline_events
       (organization_id, conversation_id, lead_phone, from_stage, to_stage, event_type, reason, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        organizationId,
        conversationId,
        phone,
        fromStage,
        toStage,
        eventType,
        reason
      ]
    );
  } catch (err) {
    console.error("Pipeline event error:", err);
  }
}

/* -------------------- SALES CONTEXT -------------------- */

function extractSalesContext(text = "") {
  const t = normalizeText(text);

  const brandTerms = [
    "thinkpad",
    "dell",
    "lenovo",
    "latitude",
    "elitebook",
    "hp",
    "yoga",
    "carbon",
    "macbook"
  ];

  const searchTerms = brandTerms.filter(term => t.includes(term));

  let useCase = null;
  if (/(universidad|colegio|escuela|estudio|estudiar|tareas|clases)/.test(t)) {
    useCase = "study";
  } else if (/(trabajo|oficina|excel|empresa|empresarial)/.test(t)) {
    useCase = "work";
  } else if (/(diseno|diseño|arquitectura|ingenieria|ingeniería|render|edicion|edición)/.test(t)) {
    useCase = "pro";
  }

  const wantsCheap = /(barata|barato|economica|economico|económica|económico|accesible|mas barata|más barata)/.test(t);
  const wantsPhotos = /(fotos|foto|imagenes|imágenes|verla|ver fotos|mandame fotos|envia fotos|envíame fotos|si enviala|si envíala)/.test(t);
  const asksGenericCatalog =
    /(que laptops tienen|qué laptops tienen|tienen laptops|tienen computadoras|que computadoras tienen|qué computadoras tienen|que equipos tienen|qué equipos tienen|que opciones tienen|qué opciones tienen|que modelos tienen|qué modelos tienen)/.test(t);

  const asksPrice =
    /(precio|cuanto cuesta|cuanto vale|valor|en cuanto|cuanto|cuánto)/.test(t);

  const asksAvailability =
    /(disponible|tienen|hay|tiene|tendran|tendrán)/.test(t);

  const productWords =
    /(laptop|laptops|computadora|computadoras|pc|portatil|portatiles|portátil|portátiles|equipo|equipos)/.test(t);

  return {
    normalizedText: t,
    searchTerms: unique(searchTerms),
    useCase,
    wantsCheap,
    wantsPhotos,
    asksGenericCatalog,
    asksPrice,
    asksAvailability,
    productWords
  };
}

/* -------------------- INTENT -------------------- */

function detectIntent(text = "", ctx = null) {
  const t = ctx?.normalizedText || normalizeText(text);

  if (!t) return "INFO";

  if (/(soporte|garantia|garantia|falla|reparacion|reparación|mantenimiento)/.test(t)) {
    return "SUPPORT";
  }

  if (/(hola|buenas|hello|hi)/.test(t)) {
    return "GREETING";
  }

  if (ctx?.asksPrice) {
    return "PRICE";
  }

  if (
    /(quiero comprar|me interesa|apartar|reservar|busco|necesito)/.test(t) ||
    ctx?.asksAvailability ||
    ctx?.productWords
  ) {
    return "BUY";
  }

  return "INFO";
}

/* -------------------- SCORE -------------------- */

function computeScore(text = "", intent = "INFO", ctx = null) {
  const t = ctx?.normalizedText || normalizeText(text);
  let score = 0;

  if (intent === "GREETING") score += 10;
  if (intent === "INFO") score += 20;
  if (intent === "PRICE") score += 45;
  if (intent === "BUY") score += 60;
  if (intent === "SUPPORT") score += 15;

  if (ctx?.asksPrice) score += 20;
  if (ctx?.asksAvailability) score += 10;
  if (ctx?.searchTerms?.length) score += 10;
  if (ctx?.wantsCheap) score += 10;
  if (/(comprar|apartar|reservar)/.test(t)) score += 15;

  return Math.min(score, 100);
}

function deriveInterestLevel(score) {
  if (score >= 85) return "HIGH";
  if (score >= 45) return "MEDIUM";
  return "LOW";
}

function deriveStage(score) {
  if (score >= 85) return "CLOSING";
  if (score >= 65) return "OFFER";
  if (score >= 45) return "QUALIFYING";
  return "DISCOVERY";
}

/* -------------------- PRODUCT SEARCH -------------------- */

async function searchCatalog(db, organizationId, ctx = {}) {
  const params = [organizationId];
  let sql = `
    SELECT id, name, price_crc AS price, 'CRC' AS currency
    FROM product_catalog
    WHERE organization_id = $1
      AND is_active = true
      AND stock > 0
  `;

  if (ctx.searchTerms?.length) {
    const likeClauses = ctx.searchTerms.map(term => {
      params.push(`%${term}%`);
      return `name ILIKE $${params.length}`;
    });

    sql += ` AND (${likeClauses.join(" OR ")})`;
  }

  if (ctx.wantsCheap) {
    sql += ` ORDER BY price_crc ASC, name ASC`;
  } else {
    sql += ` ORDER BY name ASC`;
  }

  sql += ` LIMIT 3`;

  const result = await db.query(sql, params);
  if (result.rows.length > 0) {
    return result.rows;
  }

  const fallback = await db.query(
    `SELECT id, name, price_crc AS price, 'CRC' AS currency
     FROM product_catalog
     WHERE organization_id = $1
       AND is_active = true
       AND stock > 0
     ORDER BY ${ctx.wantsCheap ? "price_crc ASC" : "name ASC"}
     LIMIT 3`,
    [organizationId]
  );

  return fallback.rows || [];
}

/* -------------------- CONVERSATION HELPERS -------------------- */

async function ensureConversationId({
  db,
  organizationId,
  phone,
  channel,
  stage,
  agentId,
  existingConversationId = null
}) {
  if (existingConversationId) return existingConversationId;

  try {
    const conv = await db.query(
      `SELECT id
       FROM conversations
       WHERE organization_id = $1
         AND external_user_id = $2
         AND channel = $3
       LIMIT 1`,
      [organizationId, phone, channel]
    );

    if (conv.rows.length > 0) {
      return conv.rows[0].id;
    }

    const newConv = await db.query(
      `INSERT INTO conversations
       (organization_id, external_user_id, channel, stage, created_at, updated_at, control_mode, agent_id)
       VALUES ($1, $2, $3, $4, NOW(), NOW(), 'HYBRID', $5)
       RETURNING id`,
      [organizationId, phone, channel, stage, agentId]
    );

    return newConv.rows[0]?.id || null;
  } catch (err) {
    console.error("ensureConversationId error:", err);
    return null;
  }
}

/* -------------------- FOLLOWUP -------------------- */

async function createFollowup({
  db,
  organizationId,
  conversationId,
  phone,
  reason
}) {
  if (!conversationId) return null;

  try {
    const existing = await db.query(
      `SELECT id
       FROM followups
       WHERE organization_id = $1
         AND conversation_id = $2
         AND status = 'pending'
       LIMIT 1`,
      [organizationId, conversationId]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    const scheduled = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const r = await db.query(
      `INSERT INTO followups
       (organization_id, lead_phone, conversation_id, scheduled_for, status, reason, payload, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, NOW(), NOW())
       RETURNING *`,
      [
        organizationId,
        phone,
        conversationId,
        scheduled,
        reason,
        JSON.stringify({})
      ]
    );

    return r.rows[0];
  } catch (err) {
    console.error("createFollowup error:", err);
    return null;
  }
}

/* -------------------- REPLY BUILDER -------------------- */

function buildReply({
  intent,
  ctx,
  catalogMatches = []
}) {
  const shouldAskUseFirst =
    intent === "BUY" &&
    ctx.asksGenericCatalog &&
    !ctx.searchTerms.length &&
    !ctx.useCase &&
    !ctx.asksPrice &&
    !ctx.wantsCheap;

  if (shouldAskUseFirst) {
    return "¡Claro! 😊 Trabajamos con laptops empresariales reacondicionadas como ThinkPad y Dell Latitude. ¿La necesitas para estudio, trabajo o algo más exigente?";
  }

  if (intent === "SUPPORT") {
    return "Claro, con gusto te ayudo con eso. ¿Me cuentas qué problema presenta el equipo?";
  }

  if (catalogMatches.length === 0) {
    if (intent === "PRICE" || intent === "BUY") {
      return "Claro 😊 Para recomendarte bien, ¿la necesitas para estudio o trabajo? Si tienes un presupuesto aproximado también te guío mejor.";
    }

    if (intent === "GREETING") {
      return "¡Hola! 👋 Gracias por escribirnos. ¿La computadora la necesitas para estudio, trabajo o algo más exigente?";
    }

    return "Con gusto te ayudo. ¿Qué tipo de computadora estás buscando?";
  }

  let intro = "¡Perfecto! 🙌";
  if (intent === "PRICE") intro = "Con gusto 🙌";
  if (ctx.wantsCheap) intro = "Claro 😊 Te muestro opciones accesibles:";
  if (ctx.searchTerms.length === 1) {
    intro = `¡Perfecto! 🙌 Encontré esta opción de ${ctx.searchTerms[0]}:`;
  } else if (ctx.searchTerms.length > 1) {
    intro = "¡Perfecto! 🙌 Encontré estas opciones:";
  }

  const lines = catalogMatches.map(p => {
    const priceFormatted =
      p.currency === "CRC"
        ? `₡${Number(p.price).toLocaleString("es-CR")}`
        : `${p.price} ${p.currency}`;

    return `💻 ${p.name} — ${priceFormatted}`;
  });

  let closing = "¿La necesitas para estudio o trabajo?";
  if (ctx.useCase === "study") {
    closing = "¿Prefieres algo compacto o pantalla más grande para estudio?";
  } else if (ctx.useCase === "work") {
    closing = "¿La ocupas más para oficina básica o algo más exigente?";
  } else if (ctx.useCase === "pro") {
    closing = "¿Qué tipo de programas piensas usar para recomendarte la ideal?";
  } else if (ctx.wantsCheap) {
    closing = "¿Qué presupuesto aproximado manejas para enseñarte la mejor opción?";
  }

  if (ctx.wantsPhotos) {
    closing = "Si quieres también te puedo enviar fotos reales del equipo que más te interese.";
  }

  return `${intro}\n\n${lines.join("\n")}\n\n${closing}`;
}

/* -------------------- SALES BRAIN -------------------- */

export async function handleSalesBrain(db, input) {
  const orgId = input.organization_id;
  const phone = input.phone;
  const text = input.text || "";
  const channel = input.channel || "whatsapp";
  const agentId = input.agent_id || null;
  const existingConversationId = input.conversation_id || null;

  const ctx = extractSalesContext(text);
  const intent = detectIntent(text, ctx);
  const score = computeScore(text, intent, ctx);
  const interest = deriveInterestLevel(score);
  const stage = deriveStage(score);

  /* CUSTOMER MEMORY */

  try {
    await db.query(
      `INSERT INTO customer_profiles
       (organization_id, phone, lead_score, interest_level, stage, last_message, last_seen, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (organization_id, phone)
       DO UPDATE SET
         lead_score = EXCLUDED.lead_score,
         interest_level = EXCLUDED.interest_level,
         stage = EXCLUDED.stage,
         last_message = EXCLUDED.last_message,
         last_seen = NOW(),
         updated_at = NOW()`,
      [
        orgId,
        phone,
        score,
        interest,
        stage,
        text
      ]
    );
  } catch (err) {
    console.error("customer_profiles upsert error:", err);
  }

  /* CATALOG */

  let catalogMatches = [];
  const shouldSearchCatalog =
    intent === "PRICE" ||
    intent === "BUY" ||
    ctx.productWords ||
    ctx.searchTerms.length > 0;

  if (shouldSearchCatalog) {
    catalogMatches = await searchCatalog(db, orgId, ctx);
  }

  /* CONVERSATION + EVENTS */

  const conversationId = await ensureConversationId({
    db,
    organizationId: orgId,
    phone,
    channel,
    stage,
    agentId,
    existingConversationId
  });

  await logPipelineEvent({
    db,
    organizationId: orgId,
    conversationId,
    phone,
    fromStage: null,
    toStage: stage,
    eventType: "STAGE_UPDATED",
    reason: `intent_${intent}`
  });

  /* FOLLOWUP */

  if (intent === "BUY" || intent === "PRICE" || score >= 80) {
    await createFollowup({
      db,
      organizationId: orgId,
      conversationId,
      phone,
      reason: `intent_${intent}`
    });
  }

  /* BUILD REPLY */

  const reply = buildReply({
    intent,
    ctx,
    catalogMatches
  });

  return {
    reply,
    intent,
    confidence: score / 100,
    leadScore: score,
    stage,
    data: {
      interest_level: interest,
      use_case: ctx.useCase,
      wants_cheap: ctx.wantsCheap,
      search_terms: ctx.searchTerms,
      ask_use_first:
        intent === "BUY" &&
        ctx.asksGenericCatalog &&
        !ctx.searchTerms.length &&
        !ctx.useCase &&
        !ctx.asksPrice &&
        !ctx.wantsCheap
    },
    catalogMatches
  };
}

/* -------------------- API BRIDGE -------------------- */

export async function handleInbound({
  pool,
  openai,
  org,
  agentId,
  conversationId,
  externalUserId,
  text,
  channel
}) {
  let sales = null;

  try {
    sales = await handleSalesBrain(pool, {
      organization_id: org.id,
      phone: externalUserId,
      text,
      channel,
      agent_id: agentId,
      conversation_id: conversationId
    });
  } catch (salesError) {
    console.error("SalesBrain failed:", salesError);
  }

  const shouldUseSalesReply = Boolean(
    sales &&
      (
        sales.catalogMatches?.length > 0 ||
        ["BUY", "PRICE", "SUPPORT", "GREETING"].includes(sales.intent) ||
        sales?.data?.ask_use_first
      )
  );

  if (shouldUseSalesReply) {
    return {
      reply: sales.reply,
      intent: sales.intent,
      confidence: sales.confidence,
      leadScore: sales.leadScore,
      stage: sales.stage,
      data: sales.data || {},
      catalogMatches: sales.catalogMatches || []
    };
  }

  let reply = null;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "You are EVA, a WhatsApp sales assistant. Keep replies short, natural, consultative, and never dump long product lists."
        },
        { role: "user", content: text }
      ]
    });

    reply = completion.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error("AI error:", err);
  }

  if (!reply) {
    reply =
      "¡Hola! 😊 Estoy aquí para ayudarte. ¿La computadora la necesitas para estudio, trabajo o algo más exigente?";
  }

  return {
    reply,
    intent: sales?.intent || "INFO",
    confidence: sales?.confidence || 0.5,
    leadScore: sales?.leadScore || 0,
    stage: sales?.stage || "DISCOVERY",
    data: sales?.data || {},
    catalogMatches: []
  };
}

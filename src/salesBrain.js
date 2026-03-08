// src/salesBrain.js
import { pool } from "./db.js";

/**
 * EVA Core - salesBrain.js
 * Bundle Quirúrgico completo con:
 * - Leads como fuente de verdad
 * - Conversaciones por organization_id + channel + external_user_id
 * - Followups con scheduled_for
 * - Customer Memory Engine integrado
 * - Catálogo contextual
 * - Execution logs
 * - Heurísticas de intención / stage / lead score
 *
 * Diseñado para Node ESM + PostgreSQL.
 */

// ============================================================
// Constantes
// ============================================================

const DEFAULT_CHANNEL = "whatsapp";
const DEFAULT_CONTROL_MODE = "HYBRID";
const MAX_CONTEXT_MESSAGES = 12;
const MAX_CATALOG_MATCHES = 3;

const INTENTS = {
  BUY: "BUY",
  INFO: "INFO",
  SUPPORT: "SUPPORT",
  GREETING: "GREETING",
  UNKNOWN: "UNKNOWN",
};

const STAGES = {
  DISCOVERY: "DISCOVERY",
  QUALIFYING: "QUALIFYING",
  OFFER: "OFFER",
  NEGOTIATION: "NEGOTIATION",
  HOT_BUYER: "HOT_BUYER",
  CLOSING: "CLOSING",
  FOLLOW_UP: "FOLLOW_UP",
};

const FOLLOWUP_STATUS = {
  PENDING: "pending",
  SENT: "sent",
  CANCELLED: "cancelled",
  FAILED: "failed",
};

const PIPELINE_EVENT_TYPES = {
  INBOUND_RECEIVED: "INBOUND_RECEIVED",
  STAGE_CHANGED: "STAGE_CHANGED",
  SCORE_CHANGED: "SCORE_CHANGED",
  FOLLOWUP_CREATED: "FOLLOWUP_CREATED",
  FOLLOWUP_SENT: "FOLLOWUP_SENT",
  MEMORY_UPDATED: "MEMORY_UPDATED",
  REPLY_GENERATED: "REPLY_GENERATED",
};

// ============================================================
// Utilidades
// ============================================================

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(text = "") {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function safeJsonParse(value, fallback = {}) {
  try {
    if (!value) return fallback;
    if (typeof value === "object") return value;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function extractBudgetCRC(text = "") {
  const raw = String(text).replace(/\./g, "").replace(/,/g, "");
  const patterns = [
    /₡\s?(\d{2,9})/i,
    /crc\s?(\d{2,9})/i,
    /colones?\s?(\d{2,9})/i,
    /presupuesto\s?(?:de|es)?\s?(\d{2,9})/i,
    /\b(\d{5,9})\b/,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n >= 10000 && n <= 50000000) return n;
    }
  }
  return null;
}

function containsAny(text, words = []) {
  return words.some((w) => text.includes(w));
}

function pickFirstProductName(matches = []) {
  return matches?.[0]?.name || matches?.[0]?.title || null;
}

function compactObject(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  );
}

// ============================================================
// Heurísticas
// ============================================================

function detectIntent(textRaw = "") {
  const text = normalizeText(textRaw);

  const buyWords = [
    "precio",
    "cuesta",
    "vale",
    "disponible",
    "tienen",
    "tiene",
    "me interesa",
    "quiero comprar",
    "quiero una",
    "ocupo",
    "apartar",
    "apartado",
    "ultima",
    "ultima unidad",
    "comprar",
  ];

  const infoWords = [
    "informacion",
    "info",
    "fotos",
    "caracteristicas",
    "specs",
    "memoria",
    "ram",
    "ssd",
    "pantalla",
    "procesador",
    "garantia",
    "ubicados",
    "ubicacion",
    "envio",
  ];

  const supportWords = [
    "garantia",
    "cambio",
    "error",
    "falla",
    "no sirve",
    "problema",
    "soporte",
    "arreglo",
    "reparacion",
    "mantenimiento",
  ];

  const greetingWords = [
    "hola",
    "buenas",
    "buenos dias",
    "buen dia",
    "pura vida",
    "hey",
    "buenas tardes",
  ];

  if (containsAny(text, buyWords)) return INTENTS.BUY;
  if (containsAny(text, supportWords)) return INTENTS.SUPPORT;
  if (containsAny(text, infoWords)) return INTENTS.INFO;
  if (containsAny(text, greetingWords)) return INTENTS.GREETING;
  return INTENTS.UNKNOWN;
}

function inferUseCase(textRaw = "") {
  const text = normalizeText(textRaw);

  if (
    containsAny(text, [
      "escuela",
      "colegio",
      "estudio",
      "estudiar",
      "universidad",
      "universitario",
      "clases",
      "tareas",
    ])
  ) {
    return "study";
  }

  if (
    containsAny(text, [
      "trabajo",
      "oficina",
      "excel",
      "word",
      "empresa",
      "teletrabajo",
      "contabilidad",
    ])
  ) {
    return "work";
  }

  if (
    containsAny(text, [
      "juegos",
      "gaming",
      "editar video",
      "diseno",
      "arquitectura",
      "render",
      "autocad",
    ])
  ) {
    return "demanding";
  }

  return null;
}

function detectProductHints(textRaw = "") {
  const text = normalizeText(textRaw);

  return {
    wantsNumpad: containsAny(text, [
      "teclado numerico",
      "numpad",
      "teclado completo",
    ]),
    wantsTouch: containsAny(text, [
      "touch",
      "tactil",
      "pantalla tactil",
      "tactil",
    ]),
    askedPhotos: containsAny(text, ["fotos", "fotos reales", "imagenes"]),
    askedWarranty: containsAny(text, ["garantia"]),
    askedLocation: containsAny(text, ["ubicados", "ubicacion", "donde estan"]),
    askedDelivery: containsAny(text, ["envio", "contra entrega", "delivery"]),
    asksAvailability: containsAny(text, [
      "disponible",
      "tienen",
      "hay",
      "stock",
      "unidades",
    ]),
  };
}

function scoreLead({ textRaw = "", intent, catalogMatches = [], entities = {} }) {
  const text = normalizeText(textRaw);
  let score = 0;

  if (intent === INTENTS.BUY) score += 45;
  if (intent === INTENTS.INFO) score += 20;
  if (catalogMatches.length > 0) score += 20;
  if (entities.budget_crc) score += 15;

  if (containsAny(text, ["apartar", "apartado", "ultima unidad", "hoy", "ya", "de una"])) {
    score += 20;
  }

  if (containsAny(text, ["precio", "cuanto cuesta", "disponible", "me interesa"])) {
    score += 15;
  }

  return clamp(score, 0, 100);
}

function inferStage({ previousStage, intent, score }) {
  if (score >= 85 && intent === INTENTS.BUY) return STAGES.HOT_BUYER;
  if (score >= 70) return STAGES.OFFER;
  if (score >= 40) return STAGES.QUALIFYING;
  if (intent === INTENTS.GREETING || !previousStage) return STAGES.DISCOVERY;
  return previousStage || STAGES.DISCOVERY;
}

// ============================================================
// DB helpers
// ============================================================

async function queryOne(client, sql, params = []) {
  const { rows } = await client.query(sql, params);
  return rows[0] || null;
}

async function getOrganizationByApiKey(client, apiKey) {
  return queryOne(
    client,
    `
      SELECT id, name, api_key, control_mode
      FROM organizations
      WHERE api_key = $1
      LIMIT 1
    `,
    [apiKey]
  );
}

async function getLeadByPhone(client, organizationId, phone) {
  return queryOne(
    client,
    `
      SELECT *
      FROM leads
      WHERE organization_id = $1
        AND phone = $2
      LIMIT 1
    `,
    [organizationId, phone]
  );
}

async function createLead(client, organizationId, phone, initialData = {}) {
  const meta = initialData.meta || {};
  return queryOne(
    client,
    `
      INSERT INTO leads (
        organization_id,
        phone,
        stage,
        budget_crc,
        product_interest,
        use_case,
        meta,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW(), NOW())
      RETURNING *
    `,
    [
      organizationId,
      phone,
      initialData.stage || STAGES.DISCOVERY,
      initialData.budget_crc || null,
      initialData.product_interest || null,
      initialData.use_case || null,
      JSON.stringify(meta),
    ]
  );
}

async function updateLead(client, leadId, patch = {}) {
  const fields = [];
  const values = [];
  let i = 1;

  for (const [key, value] of Object.entries(patch)) {
    fields.push(`${key} = $${i++}`);
    values.push(value);
  }

  fields.push(`updated_at = NOW()`);

  values.push(leadId);

  const sql = `
    UPDATE leads
    SET ${fields.join(", ")}
    WHERE id = $${i}
    RETURNING *
  `;

  return queryOne(client, sql, values);
}

async function getConversation(client, organizationId, channel, externalUserId) {
  return queryOne(
    client,
    `
      SELECT *
      FROM conversations
      WHERE organization_id = $1
        AND channel = $2
        AND external_user_id = $3
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [organizationId, channel, externalUserId]
  );
}

async function createConversation(client, organizationId, leadId, channel, externalUserId) {
  return queryOne(
    client,
    `
      INSERT INTO conversations (
        organization_id,
        lead_id,
        channel,
        external_user_id,
        stage,
        lead_score,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING *
    `,
    [organizationId, leadId, channel, externalUserId, STAGES.DISCOVERY, 0]
  );
}

async function updateConversation(client, conversationId, patch = {}) {
  const fields = [];
  const values = [];
  let i = 1;

  for (const [key, value] of Object.entries(patch)) {
    fields.push(`${key} = $${i++}`);
    values.push(value);
  }

  fields.push(`updated_at = NOW()`);

  values.push(conversationId);

  const sql = `
    UPDATE conversations
    SET ${fields.join(", ")}
    WHERE id = $${i}
    RETURNING *
  `;

  return queryOne(client, sql, values);
}

async function insertMessage(client, payload) {
  return queryOne(
    client,
    `
     await client.query(
  `
  INSERT INTO messages (
    organization_id,
    conversation_id,
    role,
    content,
    meta,
    channel,
    external_message_id,
    created_at
  )
  VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NOW())
  ON CONFLICT (organization_id, external_message_id)
  DO NOTHING
  RETURNING *
  `,
  [
    payload.organization_id,
    payload.conversation_id,
    payload.role,
    payload.content,
    JSON.stringify(payload.meta || {}),
    payload.channel || DEFAULT_CHANNEL,
    payload.external_message_id || null
  ]
);
// ============================================================
// Customer Memory Engine
// ============================================================

async function getCustomerProfile(client, organizationId, phone) {
  return queryOne(
    client,
    `
      SELECT *
      FROM customer_profiles
      WHERE organization_id = $1
        AND phone = $2
      LIMIT 1
    `,
    [organizationId, phone]
  );
}

function mergeMemory(existingMemory = {}, delta = {}) {
  return {
    ...existingMemory,
    ...compactObject({
      last_intent: delta.last_intent ?? existingMemory.last_intent,
      last_stage: delta.last_stage ?? existingMemory.last_stage,
      use_case: delta.use_case ?? existingMemory.use_case,
      budget_crc: delta.budget_crc ?? existingMemory.budget_crc,
      product_interest: delta.product_interest ?? existingMemory.product_interest,
      wants_numpad: delta.wants_numpad ?? existingMemory.wants_numpad,
      wants_touch: delta.wants_touch ?? existingMemory.wants_touch,
      asked_photos: delta.asked_photos ?? existingMemory.asked_photos,
      asked_warranty: delta.asked_warranty ?? existingMemory.asked_warranty,
      asked_location: delta.asked_location ?? existingMemory.asked_location,
      asked_delivery: delta.asked_delivery ?? existingMemory.asked_delivery,
      last_catalog_match: delta.last_catalog_match ?? existingMemory.last_catalog_match,
      last_seen_at: delta.last_seen_at ?? existingMemory.last_seen_at,
    }),
  };
}

async function upsertCustomerMemory(client, payload) {
  const existing = await getCustomerProfile(
    client,
    payload.organization_id,
    payload.phone
  );

  const existingMemory = safeJsonParse(existing?.memory, {});
  const nextMemory = mergeMemory(existingMemory, payload.memoryDelta || {});

  const summaryParts = [
    nextMemory.use_case ? `uso=${nextMemory.use_case}` : null,
    nextMemory.budget_crc ? `budget=${nextMemory.budget_crc}` : null,
    nextMemory.product_interest ? `interes=${nextMemory.product_interest}` : null,
    nextMemory.wants_numpad ? "numpad=true" : null,
    nextMemory.wants_touch ? "touch=true" : null,
  ].filter(Boolean);

  const summary = summaryParts.join(" | ");

  const profile = await queryOne(
    client,
    `
      INSERT INTO customer_profiles (
        organization_id,
        phone,
        summary,
        memory,
        last_intent,
        last_stage,
        last_seen_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, NOW(), NOW(), NOW())
      ON CONFLICT (organization_id, phone)
      DO UPDATE SET
        summary = EXCLUDED.summary,
        memory = EXCLUDED.memory,
        last_intent = EXCLUDED.last_intent,
        last_stage = EXCLUDED.last_stage,
        last_seen_at = NOW(),
        updated_at = NOW()
      RETURNING *
    `,
    [
      payload.organization_id,
      payload.phone,
      summary || null,
      JSON.stringify(nextMemory),
      nextMemory.last_intent || null,
      nextMemory.last_stage || null,
    ]
  );

  return profile;
}

// ============================================================
// Catálogo contextual
// ============================================================

async function searchCatalog(client, organizationId, textRaw, limit = MAX_CATALOG_MATCHES) {
  const text = normalizeText(textRaw);

  const { rows } = await client.query(
    `
      SELECT
        id,
        organization_id,
        name,
        category,
        description,
        price_crc,
        stock,
        metadata,
        created_at,
        updated_at
      FROM product_catalog
      WHERE organization_id = $1
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    `,
    [organizationId]
  );

  if (!rows.length) return [];

  const scored = rows
    .map((item) => {
      const haystack = normalizeText(
        [
          item.name,
          item.category,
          item.description,
          JSON.stringify(item.metadata || {}),
        ]
          .filter(Boolean)
          .join(" ")
      );

      let score = 0;

      const keywords = text.split(" ").filter((w) => w.length >= 3);
      for (const k of keywords) {
        if (haystack.includes(k)) score += 8;
      }

      if (text.includes("laptop") && haystack.includes("laptop")) score += 10;
      if (text.includes("lenovo") && haystack.includes("lenovo")) score += 12;
      if (text.includes("dell") && haystack.includes("dell")) score += 12;
      if (text.includes("thinkpad") && haystack.includes("thinkpad")) score += 16;
      if (text.includes("latitude") && haystack.includes("latitude")) score += 16;
      if (text.includes("yoga") && haystack.includes("yoga")) score += 16;
      if (text.includes("11e") && haystack.includes("11e")) score += 18;
      if (text.includes("5490") && haystack.includes("5490")) score += 18;
      if (text.includes("tactil") && haystack.includes("tactil")) score += 10;
      if (text.includes("touch") && haystack.includes("touch")) score += 10;
      if (text.includes("teclado numerico") && haystack.includes("teclado numerico")) score += 12;
      if (text.includes("16gb") && haystack.includes("16gb")) score += 10;
      if (text.includes("8gb") && haystack.includes("8gb")) score += 8;
      if (text.includes("256") && haystack.includes("256")) score += 6;
      if (text.includes("ssd") && haystack.includes("ssd")) score += 8;

      return { ...item, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

// ============================================================
// Replies
// ============================================================

function buildReply({
  textRaw,
  intent,
  stage,
  leadScore,
  catalogMatches = [],
  memory = {},
  entities = {},
}) {
  const firstProduct = catalogMatches[0];
  const useCase = entities.use_case || memory.use_case || null;
  const budget = entities.budget_crc || memory.budget_crc || null;
  const text = normalizeText(textRaw);

  // Reglas quirúrgicas primero
  if (containsAny(text, ["catalogo", "que tienen", "que opciones", "mostrar opciones"])) {
    if (catalogMatches.length) {
      const lines = catalogMatches
        .slice(0, 2)
        .map((p) => `💻 ${p.name} — ₡${Number(p.price_crc || 0).toLocaleString("es-CR")}`);
      return `¡Perfecto! 🙌\n\n${lines.join("\n")}\n\n¿Prefieres algo compacto o pantalla más grande?`;
    }
    return "¡Claro! 🙌 Cuéntame para qué la ocupas y qué presupuesto manejas para recomendarte mejor.";
  }

  if (containsAny(text, ["fotos", "fotos reales"])) {
    return "Con gusto 👍 Te puedo enviar fotos reales. ¿Cuál modelo te interesa más?";
  }

  if (containsAny(text, ["ubicados", "ubicacion", "donde estan"])) {
    return "Somos tienda en línea. Nuestras oficinas están en Villas de Ayarco, Tres Ríos. También hacemos envíos y aceptamos pagos con tarjeta.";
  }

  if (containsAny(text, ["garantia"])) {
    return "Todos nuestros equipos reacondicionados cuentan con 1 año de garantía 👍";
  }

  if (intent === INTENTS.GREETING && !catalogMatches.length) {
    return "¡Hola! 👋 Gracias por escribirnos. ¿La laptop la necesitas para estudio, trabajo o algo más exigente?";
  }

  if (intent === INTENTS.BUY && firstProduct && leadScore >= 85) {
    return `Perfecto 👍 con ese presupuesto te puedo recomendar esta opción.\n\n💻 ${firstProduct.name}\n💰 ₡${Number(firstProduct.price_crc || 0).toLocaleString("es-CR")}\n\n${firstProduct.description || "Es una opción muy confiable."}\n\nTenemos unidades disponibles.\n¿Te gustaría apartarla?`;
  }

  if (intent === INTENTS.BUY && firstProduct) {
    return `¡Perfecto! 🙌\n\n💻 ${firstProduct.name} — ₡${Number(firstProduct.price_crc || 0).toLocaleString("es-CR")}\n\n${useCase ? `Te puede funcionar muy bien para ${useCase === "study" ? "estudio" : useCase === "work" ? "trabajo" : "ese uso"}.` : "Te puede funcionar muy bien."}\n\n¿Prefieres que te enseñe esa opción o te muestro una alternativa?`;
  }

  if (intent === INTENTS.BUY && !firstProduct) {
    if (!budget && !useCase) {
      return "¡Claro! 🙌 Para asesorarte mejor, ¿la ocupas para estudio o trabajo? Y si gustas, también me dices qué presupuesto manejas.";
    }
    if (!budget) {
      return "Perfecto 👍 ¿Qué presupuesto manejas más o menos para recomendarte una opción ideal?";
    }
    if (!useCase) {
      return "Perfecto 👍 ¿La ocupas para estudio, oficina o algo más exigente?";
    }
    return "Perfecto 👍 con esa información te puedo recomendar una opción. Dame un momento y te muestro la más adecuada.";
  }

  if (intent === INTENTS.INFO && firstProduct) {
    return `Claro 🙌 ${firstProduct.name} cuesta ₡${Number(firstProduct.price_crc || 0).toLocaleString("es-CR")}.\n\nSi gustas, te explico si te conviene más para estudio o trabajo.`;
  }

  if (stage === STAGES.QUALIFYING) {
    if (!useCase) return "¡Perfecto! 🙌 ¿La ocupas para estudio, trabajo o algo más exigente?";
    if (!budget) return "¡Perfecto! 🙌 ¿Qué presupuesto manejas más o menos para recomendarte mejor?";
  }

  return "¡Con gusto! 🙌 Cuéntame un poco qué necesitas y te recomiendo la mejor opción.";
}

// ============================================================
// Followups
// ============================================================

function shouldCreateFollowup({ intent, leadScore, textRaw }) {
  const text = normalizeText(textRaw);

  if (containsAny(text, ["no gracias", "ya no", "dejelo asi", "dejalo asi"])) return false;
  if (intent === INTENTS.SUPPORT) return false;
  if (leadScore >= 40) return true;
  if (containsAny(text, ["precio", "informacion", "fotos", "disponible"])) return true;
  return false;
}

function buildFollowupMessage({ memory = {}, catalogMatches = [] }) {
  const product = pickFirstProductName(catalogMatches) || memory.product_interest || "una opción ideal";
  return `Hola 👋 Solo paso a confirmar si aún sigues buscando equipo. Si gustas, te puedo ayudar con ${product} o una alternativa según tu presupuesto.`;
}

async function createPendingFollowup(client, payload) {
  const scheduledFor =
    payload.scheduled_for ||
    addMinutes(new Date(), payload.delay_minutes || 1440).toISOString();

  return queryOne(
    client,
    `
      INSERT INTO followups (
        organization_id,
        conversation_id,
        lead_phone,
        scheduled_for,
        payload,
        status,
        reason,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NOW(), NOW())
      RETURNING *
    `,
    [
      payload.organization_id,
      payload.conversation_id,
      payload.lead_phone,
      scheduledFor,
      JSON.stringify(payload.payload || {}),
      FOLLOWUP_STATUS.PENDING,
      payload.reason || "auto_followup",
    ]
  );
}

async function processPendingFollowups(sendMessageFn) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `
        SELECT *
        FROM followups
        WHERE status = $1
          AND scheduled_for <= NOW()
        ORDER BY scheduled_for ASC
        LIMIT 50
        FOR UPDATE SKIP LOCKED
      `,
      [FOLLOWUP_STATUS.PENDING]
    );

    for (const followup of rows) {
      try {
        const payload = safeJsonParse(followup.payload, {});
        await sendMessageFn({
          organization_id: followup.organization_id,
          conversation_id: followup.conversation_id,
          phone: followup.lead_phone,
          text: payload.message || payload.reply || "Hola 👋",
          meta: {
            source: "followup_worker",
            followup_id: followup.id,
          },
        });

        await client.query(
          `
            UPDATE followups
            SET status = $1,
                updated_at = NOW()
            WHERE id = $2
          `,
          [FOLLOWUP_STATUS.SENT, followup.id]
        );

        await addPipelineEvent(client, {
          organization_id: followup.organization_id,
          conversation_id: followup.conversation_id,
          lead_id: null,
          event_type: PIPELINE_EVENT_TYPES.FOLLOWUP_SENT,
          payload: { followup_id: followup.id },
        });
      } catch (err) {
        await client.query(
          `
            UPDATE followups
            SET status = $1,
                updated_at = NOW()
            WHERE id = $2
          `,
          [FOLLOWUP_STATUS.FAILED, followup.id]
        );
      }
    }

    await client.query("COMMIT");
    return { ok: true, processed: rows.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================
// Motor principal
// ============================================================

async function resolveLead(client, organizationId, phone) {
  let lead = await getLeadByPhone(client, organizationId, phone);

  if (!lead) {
    lead = await createLead(client, organizationId, phone, {
      stage: STAGES.DISCOVERY,
      meta: {},
    });
  }

  return lead;
}

async function resolveConversation(client, organizationId, leadId, channel, externalUserId) {
  let conversation = await getConversation(client, organizationId, channel, externalUserId);

  if (!conversation) {
    conversation = await createConversation(
      client,
      organizationId,
      leadId,
      channel,
      externalUserId
    );
  }

  return conversation;
}

async function loadCustomerMemory(client, organizationId, phone) {
  const profile = await getCustomerProfile(client, organizationId, phone);
  const memory = safeJsonParse(profile?.memory, {});
  return { profile, memory };
}

export async function handleInbound({
  apiKey,
  organizationId: forcedOrganizationId = null,
  from,
  text,
  channel = DEFAULT_CHANNEL,
  external_message_id = null,
  metadata = {},
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let organization = null;

    if (forcedOrganizationId) {
      organization = { id: forcedOrganizationId, control_mode: DEFAULT_CONTROL_MODE };
    } else {
      organization = await getOrganizationByApiKey(client, apiKey);
    }

    if (!organization?.id) {
      throw new Error("unauthorized_organization");
    }

    const existingInbound = await findMessageByExternalId(
      client,
      organization.id,
      external_message_id
    );

    if (existingInbound) {
      const existingReply = await queryOne(
        client,
        `
          SELECT *
          FROM messages
          WHERE conversation_id = $1
            AND role = 'assistant'
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [existingInbound.conversation_id]
      );

      await client.query("COMMIT");

      return {
        ok: true,
        deduplicated: true,
        reply: existingReply?.content || null,
        conversation_id: existingInbound.conversation_id,
        lead_score: null,
        intent: null,
        stage: null,
        catalog_matches: [],
      };
    }

    const lead = await resolveLead(client, organization.id, from);
    const conversation = await resolveConversation(
      client,
      organization.id,
      lead.id,
      channel,
      from
    );

    const inbound = await insertMessage(client, {
      organization_id: organization.id,
      conversation_id: conversation.id,
      role: "user",
      content: text,
      channel,
      external_message_id,
      meta: {
        ...metadata,
        channel,
        external_user_id: from,
      },
    });

    await addPipelineEvent(client, {
      organization_id: organization.id,
      conversation_id: conversation.id,
      lead_id: lead.id,
      event_type: PIPELINE_EVENT_TYPES.INBOUND_RECEIVED,
      payload: {
        message_id: inbound.id,
        channel,
      },
    });

    const intent = detectIntent(text);
    const use_case = inferUseCase(text);
    const hints = detectProductHints(text);
    const budget_crc = extractBudgetCRC(text);

    const catalogMatches = await searchCatalog(client, organization.id, text);
    const leadScore = scoreLead({
      textRaw: text,
      intent,
      catalogMatches,
      entities: { budget_crc, use_case },
    });

    const stage = inferStage({
      previousStage: conversation.stage,
      intent,
      score: leadScore,
    });

    const { memory } = await loadCustomerMemory(client, organization.id, from);

    const product_interest =
      pickFirstProductName(catalogMatches) ||
      memory.product_interest ||
      null;

    const reply = buildReply({
      textRaw: text,
      intent,
      stage,
      leadScore,
      catalogMatches,
      memory,
      entities: {
        budget_crc,
        use_case,
        product_interest,
      },
    });

    const assistantMessage = await insertMessage(client, {
      organization_id: organization.id,
      conversation_id: conversation.id,
      role: "assistant",
      content: reply,
      channel,
      meta: {
        source: "sales_brain_rule",
        intent,
        stage,
        lead_score: leadScore,
      },
    });

    const updatedLead = await updateLead(client, lead.id, {
      stage,
      budget_crc: budget_crc ?? lead.budget_crc,
      product_interest: product_interest ?? lead.product_interest,
      use_case: use_case ?? lead.use_case,
      meta: JSON.stringify({
        ...(safeJsonParse(lead.meta, {})),
        last_intent: intent,
        channel,
      }),
    });

    const updatedConversation = await updateConversation(client, conversation.id, {
      stage,
      lead_score: leadScore,
      last_message_at: nowIso(),
    });

    await addPipelineEvent(client, {
      organization_id: organization.id,
      conversation_id: conversation.id,
      lead_id: lead.id,
      event_type: PIPELINE_EVENT_TYPES.REPLY_GENERATED,
      payload: {
        intent,
        stage,
        lead_score: leadScore,
        reply,
      },
    });

    if (conversation.stage !== stage) {
      await addPipelineEvent(client, {
        organization_id: organization.id,
        conversation_id: conversation.id,
        lead_id: lead.id,
        event_type: PIPELINE_EVENT_TYPES.STAGE_CHANGED,
        payload: {
          from: conversation.stage,
          to: stage,
        },
      });
    }

    if ((conversation.lead_score || 0) !== leadScore) {
      await addPipelineEvent(client, {
        organization_id: organization.id,
        conversation_id: conversation.id,
        lead_id: lead.id,
        event_type: PIPELINE_EVENT_TYPES.SCORE_CHANGED,
        payload: {
          from: conversation.lead_score || 0,
          to: leadScore,
        },
      });
    }

    const customerProfile = await upsertCustomerMemory(client, {
      organization_id: organization.id,
      phone: from,
      memoryDelta: {
        last_intent: intent,
        last_stage: stage,
        use_case,
        budget_crc,
        product_interest,
        wants_numpad: hints.wantsNumpad || undefined,
        wants_touch: hints.wantsTouch || undefined,
        asked_photos: hints.askedPhotos || undefined,
        asked_warranty: hints.askedWarranty || undefined,
        asked_location: hints.askedLocation || undefined,
        asked_delivery: hints.askedDelivery || undefined,
        last_catalog_match: product_interest || undefined,
        last_seen_at: nowIso(),
      },
    });

    await addPipelineEvent(client, {
      organization_id: organization.id,
      conversation_id: conversation.id,
      lead_id: lead.id,
      event_type: PIPELINE_EVENT_TYPES.MEMORY_UPDATED,
      payload: {
        customer_profile_id: customerProfile?.id || null,
      },
    });

    let followup = null;

    if (shouldCreateFollowup({ intent, leadScore, textRaw: text })) {
      followup = await createPendingFollowup(client, {
        organization_id: organization.id,
        conversation_id: conversation.id,
        lead_phone: from,
        delay_minutes: leadScore >= 85 ? 180 : 1440,
        payload: {
          message: buildFollowupMessage({
            memory: safeJsonParse(customerProfile?.memory, {}),
            catalogMatches,
          }),
        },
        reason: leadScore >= 85 ? "hot_lead_followup" : "standard_followup",
      });

      await addPipelineEvent(client, {
        organization_id: organization.id,
        conversation_id: conversation.id,
        lead_id: lead.id,
        event_type: PIPELINE_EVENT_TYPES.FOLLOWUP_CREATED,
        payload: {
          followup_id: followup.id,
          scheduled_for: followup.scheduled_for,
        },
      });
    }

    await logExecution(client, {
      organization_id: organization.id,
      conversation_id: conversation.id,
      message_id_in: inbound.id,
      mode_used: "RULE",
      ai_intent: intent,
      ai_confidence: intent === INTENTS.UNKNOWN ? 0.5 : 0.9,
      ai_reply: reply,
      actions_executed: [
        "intent_detected",
        "catalog_search",
        "reply_generated",
        "lead_updated",
        "conversation_updated",
        "customer_memory_upsert",
        ...(followup ? ["followup_created"] : []),
      ],
    });

    await client.query("COMMIT");

    return {
      ok: true,
      reply,
      conversation_id: updatedConversation.id,
      confidence: intent === INTENTS.UNKNOWN ? 0.5 : 0.9,
      lead_score: leadScore,
      stage,
      data: {
        budget_crc,
        use_case,
        product_interest,
      },
      catalog_matches: catalogMatches,
      customer_memory: safeJsonParse(customerProfile?.memory, {}),
      followup: followup
        ? {
            id: followup.id,
            scheduled_for: followup.scheduled_for,
            status: followup.status,
          }
        : null,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("salesBrain.handleInbound error:", error);
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================
// Función helper outbound interna
// ============================================================

export async function createOutboundMessage({
  organization_id,
  conversation_id,
  phone = null,
  text,
  meta = {},
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let resolvedConversationId = conversation_id;

    if (!resolvedConversationId && phone) {
      const lead = await getLeadByPhone(client, organization_id, phone);
      if (!lead) throw new Error("lead_not_found_for_outbound");

      const conv = await getConversation(client, organization_id, DEFAULT_CHANNEL, phone);
      if (!conv) throw new Error("conversation_not_found_for_outbound");

      resolvedConversationId = conv.id;
    }

    if (!resolvedConversationId) {
      throw new Error("conversation_id_required_for_outbound");
    }

    const message = await insertMessage(client, {
      organization_id,
      conversation_id: resolvedConversationId,
      role: "assistant",
      content: text,
      channel: meta.channel || DEFAULT_CHANNEL,
      meta: {
        ...meta,
        source: meta.source || "internal_outbound",
      },
    });

    await client.query("COMMIT");
    return message;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================
// Lecturas rápidas para dashboard/API
// ============================================================

export async function getConversationMessages(conversationId, limit = 50) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `
        SELECT id, role, content, meta, created_at
        FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC
        LIMIT $2
      `,
      [conversationId, limit]
    );
    return rows;
  } finally {
    client.release();
  }
}

export async function getLeadSummary(organizationId, phone) {
  const client = await pool.connect();
  try {
    const lead = await getLeadByPhone(client, organizationId, phone);
    const profile = await getCustomerProfile(client, organizationId, phone);
    return {
      lead,
      customer_profile: profile,
      memory: safeJsonParse(profile?.memory, {}),
    };
  } finally {
    client.release();
  }
}

export async function getMetricsSummary(organizationId) {
  const client = await pool.connect();
  try {
    const [conversationsToday, followupsPending, hotLeads] = await Promise.all([
      queryOne(
        client,
        `
          SELECT COUNT(*)::int AS count
          FROM conversations
          WHERE organization_id = $1
            AND created_at::date = CURRENT_DATE
        `,
        [organizationId]
      ),
      queryOne(
        client,
        `
          SELECT COUNT(*)::int AS count
          FROM followups
          WHERE organization_id = $1
            AND status = $2
        `,
        [organizationId, FOLLOWUP_STATUS.PENDING]
      ),
      queryOne(
        client,
        `
          SELECT COUNT(*)::int AS count
          FROM conversations
          WHERE organization_id = $1
            AND lead_score >= 85
        `,
        [organizationId]
      ),
    ]);

    return {
      conversations_today: conversationsToday?.count || 0,
      followups_pending: followupsPending?.count || 0,
      hot_leads: hotLeads?.count || 0,
    };
  } finally {
    client.release();
  }
}

// ============================================================
// Export default opcional
// ============================================================

export default {
  handleInbound,
  createOutboundMessage,
  processPendingFollowups,
  getConversationMessages,
  getLeadSummary,
  getMetricsSummary,
};

// src/salesBrain.js
// EVA Sales Brain v1 - estable, conservador y adaptado a tu DB real

function normalizeText(input = "") {
  return String(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function extractBudget(text = "") {
  const normalized = normalizeText(text);

  // Busca montos como:
  // 70000
  // 70,000
  // 70.000
  // ₡70000
  // 100 mil
  const moneyMatch =
    normalized.match(/(?:₡|\bcrc\b|\bcolon(?:es)?\b)?\s*(\d{2,3}(?:[.,]\d{3})+|\d{4,7})/) ||
    normalized.match(/(\d{2,3})\s*mil\b/);

  if (!moneyMatch) return null;

  if (moneyMatch[0].includes("mil")) {
    const n = Number(moneyMatch[1]);
    return Number.isFinite(n) ? n * 1000 : null;
  }

  const raw = moneyMatch[1].replace(/[.,]/g, "");
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function extractUseCase(text = "") {
  const t = normalizeText(text);

  if (/(escuela|colegio|estudio|estudiar|universidad|u|clases|tareas)/.test(t)) {
    return "study";
  }
  if (/(trabajo|oficina|office|empresa|empresarial|excel|administrativo)/.test(t)) {
    return "work";
  }
  if (/(diseno|editar|edicion|photoshop|illustrator|autocad|arquitectura)/.test(t)) {
    return "creative";
  }
  if (/(juego|gaming|gamer|fortnite|warzone|valorant)/.test(t)) {
    return "gaming";
  }

  return null;
}

function detectIntent(text = "") {
  const t = normalizeText(text);

  if (!t) return "INFO";

  if (/(hola|buenas|buenos dias|buenas tardes|buenas noches|pura vida|hello|hi)\b/.test(t)) {
    return "GREETING";
  }

  if (/(soporte|garantia|falla|malo|servicio tecnico|reparacion|mantenimiento|ayuda tecnica)/.test(t)) {
    return "SUPPORT";
  }

  if (/(precio|cuanto cuesta|cuanto vale|valor|en cuanto|cuanto)/.test(t)) {
    return "PRICE";
  }

  if (/(quiero comprar|me interesa|disponible|tiene[n]?|tienes?|hay|quiero esa|apartar|reservar|comprar)/.test(t)) {
    return "BUY";
  }

  return "INFO";
}

function computeScore(text = "", intent = "INFO") {
  const t = normalizeText(text);
  let score = 0;

  if (intent === "GREETING") score += 10;
  if (intent === "INFO") score += 20;
  if (intent === "PRICE") score += 35;
  if (intent === "BUY") score += 55;
  if (intent === "SUPPORT") score += 15;

  if (/(precio|cuanto cuesta|disponible|tiene|hay)/.test(t)) score += 15;
  if (/(quiero comprar|me interesa|apartar|reservar|ultima|ultimo|hoy mismo)/.test(t)) score += 25;
  if (/(ubicacion|donde estan|envio|entrega|garantia|fotos reales)/.test(t)) score += 10;
  if (/(universidad|trabajo|estudio|excel|oficina)/.test(t)) score += 10;

  return Math.min(score, 100);
}

function deriveInterestLevel(score) {
  if (score >= 85) return "HIGH";
  if (score >= 45) return "MEDIUM";
  return "LOW";
}

function deriveLeadStatus(score, intent) {
  if (score >= 85 || intent === "BUY") return "HOT";
  if (score >= 45 || intent === "PRICE") return "WARM";
  return "NEW";
}

function deriveStage(score, intent, currentStage = null) {
  const stage = currentStage || "DISCOVERY";

  if (intent === "SUPPORT") return "FOLLOW_UP";
  if (score >= 85) return "CLOSING";
  if (score >= 65) return "OFFER";
  if (score >= 45) return "QUALIFYING";
  if (stage) return stage;

  return "DISCOVERY";
}

function buildReply({ intent, score, useCase }) {
  if (intent === "GREETING") {
    return "¡Hola! 👋 Gracias por escribirnos. Con gusto te ayudo. ¿Lo ocupas para estudio, trabajo o algo más específico?";
  }

  if (intent === "PRICE") {
    return "Con gusto te ayudo con eso 🙌 Para recomendarte una opción correcta, cuéntame: ¿la necesitas para estudio o trabajo? y si tienes un presupuesto aproximado, mejor aún.";
  }

  if (intent === "BUY") {
    return "¡Perfecto! 🙌 Para recomendarte la opción ideal, dime por favor: ¿la ocupas para estudio o trabajo? y ¿qué presupuesto aproximado manejas?";
  }

  if (intent === "SUPPORT") {
    return "Claro, con gusto te ayudo. Cuéntame un poco más sobre el problema que estás presentando para orientarte mejor.";
  }

  if (useCase === "study") {
    return "¡Perfecto! Si es para estudio, te puedo orientar con una opción equilibrada y confiable. ¿Qué presupuesto aproximado manejas?";
  }

  if (useCase === "work") {
    return "Excelente. Si es para trabajo, lo ideal es buscarte una opción estable y cómoda para productividad. ¿Qué presupuesto aproximado tienes pensado?";
  }

  return "Con mucho gusto te asesoro 🙌 Cuéntame un poco más sobre lo que necesitas y el presupuesto aproximado que tienes en mente.";
}

async function getLeadByPhone(db, organizationId, phone) {
  const query = `
    SELECT *
    FROM leads
    WHERE organization_id = $1
      AND phone = $2
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  const { rows } = await db.query(query, [organizationId, phone]);
  return rows[0] || null;
}

async function createLead(db, data) {
  const query = `
    INSERT INTO leads (
      organization_id,
      phone,
      email,
      instagram,
      source,
      status,
      stage,
      budget,
      use_case,
      interest_level,
      intent,
      score,
      last_contact_at,
      created_at,
      updated_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW(), NOW()
    )
    RETURNING *
  `;

  const values = [
    data.organization_id,
    data.phone,
    data.email || null,
    data.instagram || null,
    data.source || "unknown",
    data.status,
    data.stage,
    data.budget,
    data.use_case,
    data.interest_level,
    data.intent,
    data.score,
  ];

  const { rows } = await db.query(query, values);
  return rows[0];
}

async function updateLead(db, leadId, patch) {
  const query = `
    UPDATE leads
    SET
      email = COALESCE($2, email),
      instagram = COALESCE($3, instagram),
      source = COALESCE($4, source),
      status = $5,
      stage = $6,
      budget = COALESCE($7, budget),
      use_case = COALESCE($8, use_case),
      interest_level = $9,
      intent = $10,
      score = $11,
      last_contact_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const values = [
    leadId,
    patch.email || null,
    patch.instagram || null,
    patch.source || null,
    patch.status,
    patch.stage,
    patch.budget ?? null,
    patch.use_case ?? null,
    patch.interest_level,
    patch.intent,
    patch.score,
  ];

  const { rows } = await db.query(query, values);
  return rows[0];
}

async function getLatestConversation(db, organizationId, externalUserId, channel) {
  const query = `
    SELECT *
    FROM conversations
    WHERE organization_id = $1
      AND external_user_id = $2
      AND channel = $3
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  const { rows } = await db.query(query, [organizationId, externalUserId, channel]);
  return rows[0] || null;
}

async function createConversation(db, data) {
  const query = `
    INSERT INTO conversations (
      organization_id,
      external_user_id,
      channel,
      summary,
      stage,
      created_at,
      updated_at,
      control_mode,
      agent_id
    )
    VALUES (
      $1, $2, $3, $4, $5, NOW(), NOW(), $6, $7
    )
    RETURNING *
  `;

  const values = [
    data.organization_id,
    data.external_user_id,
    data.channel,
    data.summary || null,
    data.stage || "DISCOVERY",
    data.control_mode || "HYBRID",
    data.agent_id || null,
  ];

  const { rows } = await db.query(query, values);
  return rows[0];
}

async function updateConversation(db, conversationId, patch) {
  const query = `
    UPDATE conversations
    SET
      summary = COALESCE($2, summary),
      stage = COALESCE($3, stage),
      updated_at = NOW(),
      control_mode = COALESCE($4, control_mode),
      agent_id = COALESCE($5, agent_id)
    WHERE id = $1
    RETURNING *
  `;

  const values = [
    conversationId,
    patch.summary || null,
    patch.stage || null,
    patch.control_mode || null,
    patch.agent_id || null,
  ];

  const { rows } = await db.query(query, values);
  return rows[0];
}

async function createPipelineEvent({
  db,
  organizationId,
  conversationId,
  leadPhone,
  fromStage,
  toStage,
  reason,
}) {
  if (!toStage || fromStage === toStage) return null;

  const query = `
    INSERT INTO pipeline_events (
      organization_id,
      created_at,
      conversation_id,
      to_stage,
      reason,
      lead_phone,
      from_stage
    )
    VALUES (
      $1, NOW(), $2, $3, $4, $5, $6
    )
    RETURNING *
  `;

  const values = [
    organizationId,
    conversationId,
    toStage,
    reason || "stage_changed",
    leadPhone,
    fromStage || null,
  ];

  const { rows } = await db.query(query, values);
  return rows[0] || null;
}

export async function createPendingFollowup({
  db,
  organizationId,
  conversationId,
  leadPhone,
  reason,
  payload,
  minutes = 1440,
}) {
  const scheduledFor = new Date(Date.now() + minutes * 60 * 1000);

  const query = `
  INSERT INTO followups (
    organization_id,
    lead_phone,
    conversation_id,
    due_at,
    scheduled_for,
    status,
    reason,
    payload,
    created_at,
    updated_at
  )
  VALUES (
    $1, $2, $3, $4, $4, 'PENDING', $5, $6, NOW(), NOW()
  )
  RETURNING *
`;
  const values = [
  organizationId,
  leadPhone,
  conversationId,
  scheduledFor,
  reason || "general_followup",
  payload ? JSON.stringify(payload) : JSON.stringify({})
];

  const { rows } = await db.query(query, values);
  return rows[0];
}

function shouldCreateFollowup({ intent, score }) {
  return intent === "BUY" || intent === "PRICE" || score >= 60;
}

function followupDelayMinutes({ intent, score }) {
  if (score >= 85) return 60 * 4;      // 4 horas
  if (intent === "BUY") return 60 * 24; // 24 horas
  if (intent === "PRICE") return 60 * 24;
  return 60 * 48; // 48 horas
}

function buildSummary({ text, intent, useCase, budget }) {
  const parts = [];

  if (intent) parts.push(`Intent: ${intent}`);
  if (useCase) parts.push(`Use case: ${useCase}`);
  if (budget) parts.push(`Budget: ${budget}`);
  if (text) parts.push(`Last: ${String(text).slice(0, 180)}`);

  return parts.join(" | ");
}

/**
 * Maneja la parte comercial del inbound y actualiza las tablas reales
 * que ya confirmaste en tu DB.
 *
 * Retorna:
 * {
 *   lead,
 *   conversation,
 *   pipelineEvent,
 *   followup,
 *   salesAnalysis: { intent, score, status, stage, interest_level, budget, use_case, reply }
 * }
 */
export async function handleSalesBrain(db, input) {
  const organizationId = input.organization_id;
  const phone = String(input.phone || "").trim();
  const channel = input.channel || "whatsapp";
  const text = String(input.text || "");
  const source = input.source || "api";
  const email = input.email || null;
  const instagram = input.instagram || null;
  const agentId = input.agent_id || null;
  const controlMode = input.control_mode || "HYBRID";

  if (!organizationId) {
    throw new Error("organization_id is required in handleSalesBrain()");
  }

  if (!phone) {
    throw new Error("phone is required in handleSalesBrain()");
  }

  const intent = detectIntent(text);
  const score = computeScore(text, intent);
  const interestLevel = deriveInterestLevel(score);
  const leadStatus = deriveLeadStatus(score, intent);
  const budget = extractBudget(text);
  const useCase = extractUseCase(text);
  const reply = buildReply({ intent, score, useCase });

  // 1) Lead
  const existingLead = await getLeadByPhone(db, organizationId, phone);
  const nextLeadStage = deriveStage(score, intent, existingLead?.stage || null);

  let lead;
  if (!existingLead) {
    lead = await createLead(db, {
      organization_id: organizationId,
      phone,
      email,
      instagram,
      source,
      status: leadStatus,
      stage: nextLeadStage,
      budget,
      use_case: useCase,
      interest_level: interestLevel,
      intent,
      score,
    });
  } else {
    const mergedScore = Math.max(Number(existingLead.score || 0), score);
    const mergedStatus = deriveLeadStatus(mergedScore, intent);
    const mergedInterest = deriveInterestLevel(mergedScore);
    const mergedStage = deriveStage(mergedScore, intent, existingLead.stage);

    lead = await updateLead(db, existingLead.id, {
      email,
      instagram,
      source,
      status: mergedStatus,
      stage: mergedStage,
      budget: budget ?? existingLead.budget ?? null,
      use_case: useCase ?? existingLead.use_case ?? null,
      interest_level: mergedInterest,
      intent,
      score: mergedScore,
    });
  }

  // 2) Conversation
  const existingConversation = await getLatestConversation(db, organizationId, phone, channel);
  const previousConversationStage = existingConversation?.stage || null;

  let conversation;
  if (!existingConversation) {
    conversation = await createConversation(db, {
      organization_id: organizationId,
      external_user_id: phone,
      channel,
      summary: buildSummary({ text, intent, useCase, budget }),
      stage: lead.stage || "DISCOVERY",
      control_mode: controlMode,
      agent_id: agentId,
    });
  } else {
    conversation = await updateConversation(db, existingConversation.id, {
      summary: buildSummary({ text, intent, useCase, budget }),
      stage: lead.stage || existingConversation.stage,
      control_mode: controlMode,
      agent_id: agentId,
    });
  }

  // 3) Pipeline event
  const pipelineEvent = await createPipelineEvent({
    db,
    organizationId,
    conversationId: conversation.id,
    leadPhone: phone,
    fromStage: previousConversationStage || existingLead?.stage || null,
    toStage: conversation.stage,
    reason: `intent:${intent}|score:${lead.score}`,
  });

  // 4) Followup
  let followup = null;
  if (shouldCreateFollowup({ intent, score: lead.score })) {
    followup = await createPendingFollowup({
      db,
      organizationId,
      conversationId: conversation.id,
      leadPhone: phone,
      reason: `sales_followup_${intent.toLowerCase()}`,
      payload: {
        intent,
        score: lead.score,
        suggested_reply:
          intent === "BUY"
            ? "Hola 👋 solo te doy seguimiento para saber si aún te interesa y ayudarte a avanzar con la opción ideal."
            : "Hola 👋 te doy seguimiento por si aún buscas una opción y con gusto te asesoro.",
      },
      minutes: followupDelayMinutes({ intent, score: lead.score }),
    });
  }

  return {
    lead,
    conversation,
    pipelineEvent,
    followup,
    salesAnalysis: {
      intent,
      score: lead.score,
      status: lead.status,
      stage: lead.stage,
      interest_level: lead.interest_level,
      budget: lead.budget,
      use_case: lead.use_case,
      reply,
    },
  };
}

export {
  normalizeText,
  detectIntent,
  computeScore,
  extractBudget,
  extractUseCase,
  deriveInterestLevel,
  deriveLeadStatus,
  deriveStage,
  buildReply,
};

export const handleInbound = async ({
  pool,
  openai,
  org,
  agentId,
  conversationId,
  externalUserId,
  text,
  channel
}) => {

  const brain = await handleSalesBrain(pool, {
    organization_id: org.id,
    phone: externalUserId,
    text,
    channel,
    agent_id: agentId
  });

  return {
    reply: brain.salesAnalysis.reply,
    intent: brain.salesAnalysis.intent,
    confidence: brain.salesAnalysis.score / 100,
    leadScore: brain.salesAnalysis.score,
    stage: brain.salesAnalysis.stage,
    data: {
      interest_level: brain.salesAnalysis.interest_level,
      budget: brain.salesAnalysis.budget,
      use_case: brain.salesAnalysis.use_case
    }
  };
};

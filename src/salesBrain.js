// src/salesBrain.js
// EVA Sales Brain - Stable Core

function normalizeText(input) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/* -------------------- INTENT -------------------- */

function detectIntent(text = "") {
  const t = normalizeText(text);

  if (!t) return "INFO";

  if (/(precio|cuanto cuesta|cuanto vale|valor|en cuanto|cuanto)/.test(t))
    return "PRICE";

  if (/(quiero comprar|me interesa|disponible|tiene|hay|apartar|reservar)/.test(t))
    return "BUY";

  if (/(soporte|garantia|falla|reparacion|mantenimiento)/.test(t))
    return "SUPPORT";

  if (/(hola|buenas|hello|hi)/.test(t))
    return "GREETING";

  return "INFO";
}

/* -------------------- SCORE -------------------- */

function computeScore(text = "", intent = "INFO") {
  const t = normalizeText(text);
  let score = 0;

  if (intent === "GREETING") score += 10;
  if (intent === "INFO") score += 20;
  if (intent === "PRICE") score += 40;
  if (intent === "BUY") score += 60;

  if (/(precio|cuanto cuesta|disponible|tiene)/.test(t)) score += 20;
  if (/(comprar|apartar|reservar)/.test(t)) score += 25;

  return Math.min(score, 100);
}

function deriveInterestLevel(score) {
  if (score >= 85) return "HIGH";
  if (score >= 45) return "MEDIUM";
  return "LOW";
}

function deriveLeadStatus(score, intent) {
  if (score >= 85 || intent === "BUY") return "HOT";
  if (score >= 45) return "WARM";
  return "NEW";
}

function deriveStage(score) {
  if (score >= 85) return "CLOSING";
  if (score >= 65) return "OFFER";
  if (score >= 45) return "QUALIFYING";
  return "DISCOVERY";
}

/* -------------------- REPLY -------------------- */

function buildReply({ intent, catalogMatches = [] }) {

  let baseReply = "";

  if (intent === "GREETING") baseReply = "¡Hola! 👋 Gracias por escribirnos.";
  else if (intent === "PRICE") baseReply = "Con gusto te ayudo 🙌";
  else if (intent === "BUY") baseReply = "¡Perfecto! 🙌";
  else if (intent === "SUPPORT") baseReply = "Claro, con gusto te ayudo con eso.";
  else baseReply = "Con gusto te ayudo.";

  let productsText = "";

  if (catalogMatches.length > 0) {

    productsText = "\n\nTenemos estas opciones disponibles:\n\n";

    for (const p of catalogMatches) {

      const priceFormatted =
        p.currency === "CRC"
          ? `₡${Number(p.price).toLocaleString("es-CR")}`
          : `${p.price} ${p.currency}`;

      productsText += `💻 ${p.name} — ${priceFormatted}\n`;
    }

  }

  const closing =
    "\n\n¿La necesitas para estudio o trabajo? Si tienes un presupuesto aproximado también puedo recomendarte la mejor opción.";

  return baseReply + productsText + closing;
}

/* -------------------- PRODUCT SEARCH -------------------- */

async function searchCatalog(db, organizationId) {

  const query = `
    SELECT id,name,price_crc AS price,'CRC' AS currency
    FROM product_catalog
    WHERE organization_id=$1
    LIMIT 3
  `;

  const { rows } = await db.query(query, [organizationId]);

  return rows || [];
}

async function getProductImages(db, productIds) {

  if (!productIds.length) return [];

  const query = `
    SELECT product_id,url
    FROM product_assets
    WHERE product_id = ANY($1)
    ORDER BY sort_order ASC
  `;

  const { rows } = await db.query(query, [productIds]);

  return rows || [];
}

/* -------------------- LEAD -------------------- */

async function getLead(db, orgId, phone) {

  const r = await db.query(
    `SELECT * FROM leads
     WHERE organization_id=$1 AND phone=$2
     LIMIT 1`,
    [orgId, phone]
  );

  return r.rows[0] || null;
}

async function createLead(db, data) {

  const r = await db.query(
    `INSERT INTO leads
     (organization_id,phone,status,stage,interest_level,intent,score,created_at,updated_at,last_contact_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW(),NOW())
     RETURNING *`,
    [
      data.organization_id,
      data.phone,
      data.status,
      data.stage,
      data.interest_level,
      data.intent,
      data.score
    ]
  );

  return r.rows[0];
}

async function updateLead(db, id, patch) {

  const r = await db.query(
    `UPDATE leads
     SET status=$2,
         stage=$3,
         interest_level=$4,
         intent=$5,
         score=$6,
         last_contact_at=NOW(),
         updated_at=NOW()
     WHERE id=$1
     RETURNING *`,
    [
      id,
      patch.status,
      patch.stage,
      patch.interest_level,
      patch.intent,
      patch.score
    ]
  );

  return r.rows[0];
}

/* -------------------- CONVERSATION -------------------- */

async function getConversation(db, orgId, phone, channel) {

  const r = await db.query(
    `SELECT * FROM conversations
     WHERE organization_id=$1
     AND external_user_id=$2
     AND channel=$3
     LIMIT 1`,
    [orgId, phone, channel]
  );

  return r.rows[0] || null;
}

async function createConversation(db, data) {

  const r = await db.query(
    `INSERT INTO conversations
     (organization_id,external_user_id,channel,stage,created_at,updated_at,control_mode,agent_id)
     VALUES ($1,$2,$3,$4,NOW(),NOW(),'HYBRID',$5)
     RETURNING *`,
    [
      data.organization_id,
      data.external_user_id,
      data.channel,
      data.stage,
      data.agent_id
    ]
  );

  return r.rows[0];
}

/* -------------------- FOLLOWUP -------------------- */

async function createFollowup({ db, organizationId, conversationId, phone, reason }) {

  // 1️⃣ verificar si ya existe followup pendiente
  const existing = await db.query(
    `SELECT id
     FROM followups
     WHERE organization_id=$1
     AND conversation_id=$2
     AND status='pending'
     LIMIT 1`,
    [organizationId, conversationId]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  // 2️⃣ calcular fecha (24h)
  const scheduled = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // 3️⃣ crear followup
  const r = await db.query(
    `INSERT INTO followups
     (organization_id, lead_phone, conversation_id, scheduled_for, status, reason, payload, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'pending',$5,$6,NOW(),NOW())
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
}

/* -------------------- CORE -------------------- */

export async function handleSalesBrain(db, input) {

  const orgId = input.organization_id;
  const phone = input.phone;
  const text = input.text || "";
  const channel = input.channel || "whatsapp";
  const agentId = input.agent_id || null;

  const intent = detectIntent(text);
  const score = computeScore(text, intent);

  const interest = deriveInterestLevel(score);
  const status = deriveLeadStatus(score, intent);
  const stage = deriveStage(score);

  const catalogMatches =
    intent === "PRICE" || intent === "BUY"
      ? await searchCatalog(db, orgId)
      : [];

  let productImages = [];

  if (catalogMatches.length > 0) {
    const productIds = catalogMatches.map(p => p.id);
    productImages = await getProductImages(db, productIds);
  }

  const reply = buildReply({ intent, catalogMatches });

  let lead = await getLead(db, orgId, phone);

  if (!lead) {

    lead = await createLead(db, {
      organization_id: orgId,
      phone,
      status,
      stage,
      interest_level: interest,
      intent,
      score
    });

  } else {

    lead = await updateLead(db, lead.id, {
      status,
      stage,
      interest_level: interest,
      intent,
      score
    });

  }

  let conversation = await getConversation(db, orgId, phone, channel);

  if (!conversation) {

    conversation = await createConversation(db, {
      organization_id: orgId,
      external_user_id: phone,
      channel,
      stage,
      agent_id: agentId
    });

  }

  let followup = null;

  if (score >= 60) {

    followup = await createFollowup({
      db,
      organizationId: orgId,
      conversationId: conversation.id,
      phone,
      reason: `intent_${intent}`
    });

  }

  return {
    lead,
    conversation,
    followup,
    catalogMatches,
    productImages,
    salesAnalysis: {
      intent,
      score,
      status,
      stage,
      interest_level: interest,
      reply
    }
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

  let intent = "UNKNOWN";
  let confidence = 0.5;
  let leadScore = 10;
  let stage = "DISCOVERY";
  let reply = null;
  let data = {};
  let catalogMatches = [];

  try {

    /* ---------------- IA INTENT DETECTION ---------------- */

    try {

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "You are a sales intent classifier. Return JSON only."
          },
          {
            role: "user",
            content: text
          }
        ]
      });

      const raw = completion.choices?.[0]?.message?.content;

      if (raw) {
        const parsed = JSON.parse(raw);

        intent = parsed.intent || intent;
        confidence = parsed.confidence || confidence;
        leadScore = parsed.leadScore || leadScore;
        stage = parsed.stage || stage;
        data = parsed.data || {};

      }

    } catch (aiError) {

      console.error("AI intent detection failed:", aiError);

    }

    /* ---------------- RESPUESTA IA ---------------- */

    try {

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.6,
        messages: [
          {
            role: "system",
            content:
              "You are EVA, a friendly AI sales assistant helping the user."
          },
          {
            role: "user",
            content: text
          }
        ]
      });

      reply =
        completion.choices?.[0]?.message?.content ||
        null;

    } catch (aiReplyError) {

      console.error("AI reply generation failed:", aiReplyError);

    }

  } catch (fatalError) {

    console.error("handleInbound fatal error:", fatalError);

  }

  /* ---------------- FALLBACK FINAL ---------------- */

  if (!reply) {

    reply =
      "¡Hola! 😊 Estoy aquí para ayudarte. ¿Podrías contarme un poco más de lo que necesitas?";

  }

  /* ---------------- CREAR FOLLOWUP ---------------- */

  try {

    if (leadScore >= 40) {

      await createFollowup({
        db: pool,
        organizationId: org.id,
        conversationId,
        phone: externalUserId,
        reason: "lead_engaged"
      });

    }

  } catch (followupError) {

    console.error("Followup creation failed:", followupError);

  }

  return {
    reply,
    intent,
    confidence,
    leadScore,
    stage,
    data,
    catalogMatches
  };
}

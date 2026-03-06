// src/salesBrain.js
// EVA Sales Brain - Stable Core (Refactor P0/P1)

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

  const { rows } = await db.query(
    `SELECT id,name,price_crc AS price,'CRC' AS currency
     FROM product_catalog
     WHERE organization_id=$1
     LIMIT 3`,
    [organizationId]
  );

  return rows || [];

}

async function getProductImages(db, productIds) {

  if (!productIds.length) return [];

  const { rows } = await db.query(
    `SELECT product_id,url
     FROM product_assets
     WHERE product_id = ANY($1)
     ORDER BY sort_order ASC`,
    [productIds]
  );

  return rows || [];

}

/* -------------------- FOLLOWUP -------------------- */

async function createFollowup({ db, organizationId, conversationId, phone, reason }) {

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

  const scheduled = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const r = await db.query(
    `INSERT INTO followups
     (organization_id,lead_phone,conversation_id,scheduled_for,status,reason,payload,created_at,updated_at)
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

/* -------------------- SALES BRAIN -------------------- */

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

  const reply = buildReply({ intent, catalogMatches });

  let conversationId = null;

  const conv = await db.query(
    `SELECT id
     FROM conversations
     WHERE organization_id=$1
     AND external_user_id=$2
     AND channel=$3
     LIMIT 1`,
    [orgId, phone, channel]
  );

  if (conv.rows.length === 0) {

    const newConv = await db.query(
      `INSERT INTO conversations
       (organization_id,external_user_id,channel,stage,created_at,updated_at,control_mode,agent_id)
       VALUES ($1,$2,$3,$4,NOW(),NOW(),'HYBRID',$5)
       RETURNING *`,
      [orgId, phone, channel, stage, agentId]
    );

    conversationId = newConv.rows[0].id;

  } else {

    conversationId = conv.rows[0].id;

  }

  let followup = null;

  if (score >= 60) {

    followup = await createFollowup({
      db,
      organizationId: orgId,
      conversationId,
      phone,
      reason: `intent_${intent}`
    });

  }

  return {
    reply,
    catalogMatches,
    salesAnalysis: {
      intent,
      score,
      stage,
      interest_level: interest
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
  let stage = "DISCOVERY";
  let leadScore = 0;
  let reply = null;

  try {

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
      messages: [
        { role: "system", content: "You are EVA, a friendly AI sales assistant." },
        { role: "user", content: text }
      ]
    });

    reply = completion.choices?.[0]?.message?.content || null;

  } catch (err) {

    console.error("AI error:", err);

  }

  let sales = null;

  try {

    sales = await handleSalesBrain(pool, {
      organization_id: org.id,
      phone: externalUserId,
      text,
      channel,
      agent_id: agentId
    });

    if (sales?.salesAnalysis) {

      leadScore = sales.salesAnalysis.score || 0;
      stage = sales.salesAnalysis.stage || stage;

    }

  } catch (salesError) {

    console.error("SalesBrain failed:", salesError);

  }

  if (!reply) {

    reply =
      "¡Hola! 😊 Estoy aquí para ayudarte. ¿Podrías contarme un poco más de lo que necesitas?";

  }

  if (leadScore >= 40) {

    try {

      await createFollowup({
        db: pool,
        organizationId: org.id,
        conversationId,
        phone: externalUserId,
        reason: "lead_engaged"
      });

    } catch (err) {

      console.error("Followup failed:", err);

    }

  }

  return {
    reply,
    intent,
    confidence,
    leadScore,
    stage,
    catalogMatches: sales?.catalogMatches || []
  };

}

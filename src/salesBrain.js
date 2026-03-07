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
  try {
    await db.query(
      `INSERT INTO pipeline_events
       (organization_id,conversation_id,lead_phone,from_stage,to_stage,event_type,reason,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
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

/* -------------------- INTENT -------------------- */

function detectIntent(text = "") {

  const t = normalizeText(text);

  if (!t) return "INFO";

  if (/(precio|cuanto cuesta|cuanto vale|valor|en cuanto|cuanto)/.test(t))
    return "PRICE";

  if (/(quiero comprar|me interesa|disponible|tiene|hay|apartar|reservar|busco|necesito|para estudiar|para trabajo)/.test(t))
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

function deriveStage(score) {

  if (score >= 85) return "CLOSING";
  if (score >= 65) return "OFFER";
  if (score >= 45) return "QUALIFYING";
  return "DISCOVERY";

}

/* -------------------- REPLY BUILDER -------------------- */

function buildReply({ intent, catalogMatches = [] }) {

  let baseReply = "";

  if (intent === "GREETING")
    baseReply = "¡Hola! 👋 Gracias por escribirnos.";
  else if (intent === "PRICE")
    baseReply = "Con gusto te ayudo 🙌";
  else if (intent === "BUY")
    baseReply = "¡Perfecto! 🙌";
  else if (intent === "SUPPORT")
    baseReply = "Claro, con gusto te ayudo con eso.";
  else
    baseReply = "Con gusto te ayudo.";

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
    "\n\n¿La necesitas para estudio o trabajo?";

  return baseReply + productsText + closing;

}

/* -------------------- PRODUCT SEARCH -------------------- */

async function searchCatalog(db, organizationId) {

  const { rows } = await db.query(
    `SELECT id,name,price_crc AS price,'CRC' AS currency
     FROM product_catalog
     WHERE organization_id=$1
     AND is_active=true
     AND stock > 0
     LIMIT 3`,
    [organizationId]
  );

  return rows || [];

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
  const stage = deriveStage(score);

  const t = normalizeText(text);

  let catalogMatches = [];

  if (
    intent === "PRICE" ||
    intent === "BUY" ||
    /laptop|laptops|computadora|computadoras|pc|portatil|portatiles/.test(t)
  ) {
    catalogMatches = await searchCatalog(db, orgId);
  }

  const reply = buildReply({
    intent,
    catalogMatches
  });

  return {
    reply,
    intent,
    confidence: score / 100,
    leadScore: score,
    stage,
    data: {
      interest_level: interest
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
      agent_id: agentId
    });

  } catch (salesError) {

    console.error("SalesBrain failed:", salesError);

  }

  if (sales?.catalogMatches && sales.catalogMatches.length > 0) {

    return {
      reply: sales.reply,
      intent: sales.intent,
      confidence: sales.confidence,
      leadScore: sales.leadScore,
      stage: sales.stage,
      data: sales.data || {},
      catalogMatches: sales.catalogMatches
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
          content: `You are EVA, a WhatsApp sales assistant. Keep replies short and natural.`
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
      "¡Hola! 😊 Estoy aquí para ayudarte. ¿Qué tipo de computadora estás buscando?";

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

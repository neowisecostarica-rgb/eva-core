import pool from "./db.js";

/*
====================================================
HANDLE INBOUND MESSAGE (CORE)
====================================================
*/

export async function handleInboundMessage(payload) {
  try {
    const {
      organization_id,
      phone,
      text,
      channel = "whatsapp",
      message_id
    } = payload;

    console.log("🧠 EVA inbound:", { phone, text, message_id });

    /*
    =====================================
    🛑 IDEMPOTENCIA
    =====================================
    */

    if (message_id) {
      const existing = await pool.query(
        `SELECT id FROM messages WHERE external_message_id = $1 LIMIT 1`,
        [message_id]
      );

      if (existing.rows.length > 0) {
        console.log("⚠️ Duplicate message:", message_id);
        return { reply: null, media: [] };
      }
    }

    /*
    =====================================
    💾 GUARDAR MENSAJE USER
    =====================================
    */

    await pool.query(
      `
      INSERT INTO messages (
        organization_id,
        external_message_id,
        role,
        content,
        created_at
      )
      VALUES ($1, $2, 'user', $3, NOW())
      `,
      [organization_id, message_id || null, text]
    );

    /*
    =====================================
    🧠 SALES BRAIN PIPELINE
    =====================================
    */

    const intent = analyzeIntent(text);
    const entities = extractEntities(text);
    const stage = determineStage(intent, entities);
    const lead_score = calculateLeadScore(intent, entities);
    const action = decideAction({ intent, stage, entities, lead_score });
    const reply = buildReply({ action, entities });

    /*
    =====================================
    💾 GUARDAR MENSAJE ASSISTANT
    =====================================
    */

    await pool.query(
      `
      INSERT INTO messages (
        organization_id,
        role,
        content,
        created_at
      )
      VALUES ($1, 'assistant', $2, NOW())
      `,
      [organization_id, reply]
    );

    return {
      reply,
      media: [],
      intent,
      stage,
      lead_score,
      entities,
      should_followup: lead_score > 60
    };

  } catch (error) {
    console.error("❌ ERROR salesBrain:", error);

    return {
      reply: "Hubo un error procesando el mensaje",
      media: []
    };
  }
}

/*
====================================================
🧠 FUNCIONES INTERNAS
====================================================
*/

function analyzeIntent(text) {
  const t = text.toLowerCase();

  if (t.includes("hola")) return "GREETING";
  if (t.includes("precio") || t.includes("tiene")) return "BUY";
  if (t.includes("problema") || t.includes("reparar")) return "SUPPORT";

  return "INFO";
}

function extractEntities(text) {
  const t = text.toLowerCase();

  return {
    product: t.includes("laptop") ? "laptop" : null,
    brand: t.includes("lenovo") ? "lenovo" : null,
    use_case: t.includes("estudio") ? "estudio" : null,
    budget: null
  };
}

function determineStage(intent, entities) {
  if (intent === "GREETING") return "NEW";
  if (entities.use_case) return "QUALIFYING";
  if (entities.product || entities.brand) return "OFFERING";
  return "NEW";
}

function calculateLeadScore(intent, entities) {
  let score = 0;

  if (intent === "BUY") score += 40;
  if (entities.product) score += 20;
  if (entities.use_case) score += 20;
  if (entities.brand) score += 10;

  return score;
}

function decideAction({ stage }) {
  if (stage === "NEW") return "ASK_QUESTION";
  if (stage === "QUALIFYING") return "ASK_DETAILS";
  if (stage === "OFFERING") return "SHOW_OPTIONS";

  return "ASK_QUESTION";
}

function buildReply({ action }) {
  switch (action) {
    case "ASK_DETAILS":
      return "Perfecto 😊 ¿la necesitás para estudio, trabajo o algo más específico?";

    case "SHOW_OPTIONS":
      return "Claro 🙌 tenemos varias opciones disponibles. ¿Querés que te recomiende según tu uso?";

    default:
      return "Hola 😊 con gusto te ayudo. ¿Qué estás buscando exactamente?";
  }
}

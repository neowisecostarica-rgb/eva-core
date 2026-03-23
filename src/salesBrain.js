import pool from "./db.js";
import { generateAIReply } from "./aiReply.js";

/*
====================================================
HANDLE INBOUND MESSAGE (CONVERSATION MEMORY V1)
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

    console.log("🧠 EVA inbound:", {
      phone,
      text,
      message_id
    });

    const normalizedText = normalizeText(text);

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
    🧠 CONVERSATION MEMORY
    =====================================
    */

    const conversation = await ensureConversationSafe({
      organization_id,
      channel,
      external_user_id: phone
    });

    const previousStage = conversation?.stage || "NEW";
    const previousSummary = conversation?.summary || "";

    /*
    =====================================
    💾 GUARDAR MENSAJE USER
    =====================================
    */

    await pool.query(
      `
      INSERT INTO messages (
        organization_id,
        conversation_id,
        external_message_id,
        role,
        content,
        created_at
      )
      VALUES ($1, $2, $3, 'user', $4, NOW())
      `,
      [
        organization_id,
        conversation?.id || null,
        message_id || null,
        text
      ]
    );

    /*
    =====================================
    🧠 PIPELINE DEL SALES BRAIN
    =====================================
    */

    const intent = analyzeIntent(normalizedText);
    const entities = extractEntities(normalizedText);
    const lead_score = calculateLeadScore(intent, entities);

    const stage = determineStage({
      intent,
      entities,
      previousStage
    });

    const action = decideAction({
      intent,
      entities,
      stage,
      previousStage,
      lead_score
    });

   let reply = await generateAIReply({
  text,
  stage,
  intent,
  entities,
  summary
});

// fallback (por si falla AI)
if (!reply) {
  reply = buildReply({
    action,
    entities
  });
}
    });

    const summary = buildSummary({
      previousSummary,
      entities,
      stage,
      normalizedText
    });

    /*
    =====================================
    💾 GUARDAR MENSAJE ASSISTANT
    =====================================
    */

    await pool.query(
      `
      INSERT INTO messages (
        organization_id,
        conversation_id,
        role,
        content,
        created_at
      )
      VALUES ($1, $2, 'assistant', $3, NOW())
      `,
      [
        organization_id,
        conversation?.id || null,
        reply
      ]
    );

    /*
    =====================================
    🧠 ACTUALIZAR CONVERSATION
    =====================================
    */

    await updateConversationSafe({
      conversationId: conversation?.id || null,
      organization_id,
      channel,
      external_user_id: phone,
      stage,
      summary
    });

    return {
      reply,
      media: [],
      intent,
      stage,
      lead_score,
      entities,
      should_followup: lead_score >= 60
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
CONVERSATIONS
====================================================
*/

async function ensureConversationSafe({ organization_id, channel, external_user_id }) {
  try {
    const found = await pool.query(
      `
      SELECT id, stage, summary
      FROM conversations
      WHERE organization_id = $1
        AND channel = $2
        AND external_user_id = $3
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [organization_id, channel, external_user_id]
    );

    if (found.rows.length > 0) {
      await pool.query(
        `
        UPDATE conversations
        SET last_message_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        `,
        [found.rows[0].id]
      );

      return found.rows[0];
    }

    const created = await pool.query(
      `
      INSERT INTO conversations (
        organization_id,
        channel,
        external_user_id,
        stage,
        summary,
        last_message_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, 'NEW', '', NOW(), NOW(), NOW())
      RETURNING id, stage, summary
      `,
      [organization_id, channel, external_user_id]
    );

    return created.rows[0];

  } catch (error) {
    console.warn("⚠️ Conversation memory fallback:", error.message);
    return null;
  }
}

async function updateConversationSafe({
  conversationId,
  organization_id,
  channel,
  external_user_id,
  stage,
  summary
}) {
  try {
    if (conversationId) {
      await pool.query(
        `
        UPDATE conversations
        SET stage = $2,
            summary = $3,
            last_message_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        `,
        [conversationId, stage, summary]
      );
      return;
    }

  } catch (error) {
    console.warn("⚠️ Conversation update skipped:", error.message);
  }
}

/*
====================================================
BRAIN
====================================================
*/

function analyzeIntent(text) {
  if (text.includes("hola")) return "GREETING";
  if (text.includes("laptop") || text.includes("lenovo")) return "BUY";
  return "INFO";
}

function extractEntities(text) {
  return {
    product: text.includes("laptop") ? "laptop" : null,
    brand: text.includes("lenovo") ? "lenovo" : null,
    use_case: text.includes("estudio") ? "estudio" : null
  };
}

function determineStage({ entities, previousStage }) {
  if (entities.brand) return "OFFERING";
  if (entities.use_case) return "QUALIFYING";
  if (entities.product) return previousStage === "QUALIFYING" ? "OFFERING" : "QUALIFYING";
  return previousStage;
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
  if (stage === "QUALIFYING") return "ASK_MORE";
  if (stage === "OFFERING") return "SHOW_OPTIONS";
  return "ASK";
}

function buildReply({ action }) {
  if (action === "ASK_MORE") {
    return "Perfecto 😊 ¿tenés algún presupuesto o marca de preferencia?";
  }

  if (action === "SHOW_OPTIONS") {
    return "Claro 🙌 tengo opciones disponibles. ¿Querés que te recomiende una según tu uso?";
  }

  return "Hola 😊 ¿Qué estás buscando exactamente?";
}

function buildSummary({ previousSummary, entities, stage }) {
  return `${previousSummary} | ${JSON.stringify(entities)} | stage:${stage}`;
}

/*
====================================================
UTILS
====================================================
*/

function normalizeText(text) {
  return (text || "").toLowerCase().trim();
}

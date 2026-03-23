import pool from "./db.js";

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

    const reply = buildReply({
      action,
      entities,
      previousStage,
      normalizedText
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
        role,
        content,
        created_at
      )
      VALUES ($1, 'assistant', $2, NOW())
      `,
      [organization_id, reply]
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
    console.warn("⚠️ Conversation memory unavailable, fallback mode active:", error.message);
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

    await pool.query(
      `
      UPDATE conversations
      SET stage = $4,
          summary = $5,
          last_message_at = NOW(),
          updated_at = NOW()
      WHERE organization_id = $1
        AND channel = $2
        AND external_user_id = $3
      `,
      [organization_id, channel, external_user_id, stage, summary]
    );
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
  if (containsAny(text, ["hola", "buenos dias", "buenas", "buen día", "buenas tardes", "buenas noches"])) {
    return "GREETING";
  }

  if (containsAny(text, ["precio", "cuanto", "cuánto", "vale", "costo", "cuesta"])) {
    return "BUY";
  }

  if (containsAny(text, ["laptop", "laptops", "computadora", "pc", "lenovo", "dell", "hp"])) {
    return "BUY";
  }

  if (containsAny(text, ["problema", "reparar", "mantenimiento", "soporte"])) {
    return "SUPPORT";
  }

  if (hasOnlyEmojiOrAnger(text)) {
    return "NEGATIVE";
  }

  return "INFO";
}

function extractEntities(text) {
  return {
    product: containsAny(text, ["laptop", "laptops", "computadora", "pc"]) ? "laptop" : null,
    brand: containsAny(text, ["lenovo", "dell", "hp"]) ? firstBrand(text) : null,
    use_case: detectUseCase(text),
    budget: detectBudget(text)
  };
}

function determineStage({ intent, entities, previousStage }) {
  if (intent === "NEGATIVE") return previousStage || "NEW";

  if (entities.brand) return "OFFERING";
  if (entities.use_case) return "QUALIFYING";
  if (entities.product) return previousStage === "QUALIFYING" ? "OFFERING" : "QUALIFYING";
  if (intent === "BUY") return previousStage === "NEW" ? "QUALIFYING" : previousStage;

  return previousStage || "NEW";
}

function calculateLeadScore(intent, entities) {
  let score = 0;

  if (intent === "BUY") score += 40;
  if (entities.product) score += 20;
  if (entities.use_case) score += 20;
  if (entities.brand) score += 15;
  if (entities.budget) score += 10;

  return score;
}

function decideAction({ intent, entities, stage, previousStage, lead_score }) {
  if (intent === "NEGATIVE") return "DEESCALATE";
  if (intent === "GREETING" && previousStage === "NEW") return "GREET";

  if (entities.product && !entities.use_case) return "ASK_USE_CASE";
  if (entities.use_case && !entities.brand && !entities.budget) return "ASK_BUDGET_OR_BRAND";
  if (entities.brand) return "SHOW_BRAND_OPTIONS";
  if (lead_score >= 60 && stage === "OFFERING") return "OFFER_OPTIONS";

  if (stage === "QUALIFYING") return "ASK_BUDGET_OR_BRAND";
  if (stage === "OFFERING") return "OFFER_OPTIONS";

  return "ASK_OPEN";
}

function buildReply({ action, entities }) {
  switch (action) {
    case "GREET":
      return "Hola 😊 con gusto te ayudo. ¿Qué estás buscando exactamente?";

    case "ASK_USE_CASE":
      return "Claro 🙌 tenemos varias opciones disponibles. ¿La estás buscando para estudio, trabajo o algo más específico?";

    case "ASK_BUDGET_OR_BRAND":
      if (entities.use_case === "estudio" || entities.use_case === "clases_virtuales") {
        return "Perfecto 😊 para estudio o clases virtuales te puedo recomendar opciones rápidas y confiables. ¿Tenés algún presupuesto aproximado o preferís alguna marca como Lenovo, Dell o HP?";
      }

      return "Perfecto 😊 para recomendarte mejor una opción, ¿tenés algún presupuesto aproximado o alguna marca de preferencia?";

    case "SHOW_BRAND_OPTIONS":
      return `Sí, claro 😊 manejamos opciones ${capitalize(entities.brand)} y también otras marcas corporativas. ¿Querés que te recomiende según tu uso y presupuesto?`;

    case "OFFER_OPTIONS":
      return "Claro 😊 ya con eso te puedo orientar mejor. ¿Querés que te recomiende algunas opciones disponibles según lo que necesitás?";

    case "DEESCALATE":
      return "Con gusto te ayudo. Contame qué necesitás y trato de orientarte de la mejor manera.";

    case "ASK_OPEN":
    default:
      return "Perfecto 😊 contame un poco más qué estás buscando y te ayudo a encontrar la mejor opción.";
  }
}

function buildSummary({ previousSummary, entities, stage, normalizedText }) {
  const parts = [];

  if (previousSummary) parts.push(previousSummary);
  if (entities.product) parts.push(`producto:${entities.product}`);
  if (entities.brand) parts.push(`marca:${entities.brand}`);
  if (entities.use_case) parts.push(`uso:${entities.use_case}`);
  if (entities.budget) parts.push(`presupuesto:${entities.budget}`);
  if (!entities.product && !entities.brand && !entities.use_case && normalizedText) {
    parts.push(`último:${normalizedText.slice(0, 80)}`);
  }

  parts.push(`stage:${stage}`);

  return dedupeSummaryParts(parts).join(" | ").slice(0, 500);
}

/*
====================================================
UTILS
====================================================
*/

function normalizeText(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function containsAny(text, words) {
  return words.some((word) => text.includes(word));
}

function detectUseCase(text) {
  if (containsAny(text, ["estudio", "estudiar", "colegio", "escuela", "universidad"])) {
    return "estudio";
  }

  if (containsAny(text, ["clases virtuales", "zoom", "meet", "teams"])) {
    return "clases_virtuales";
  }

  if (containsAny(text, ["trabajo", "oficina", "excel"])) {
    return "trabajo";
  }

  if (containsAny(text, ["edicion", "edición", "diseno", "diseño", "video", "fotos"])) {
    return "edicion";
  }

  return null;
}

function detectBudget(text) {
  const match = text.match(/(\d{2,3}(?:[.,]\d{3})+|\d{5,7})/);
  if (!match) return null;

  return match[1].replace(/[.,]/g, "");
}

function firstBrand(text) {
  if (text.includes("lenovo")) return "lenovo";
  if (text.includes("dell")) return "dell";
  if (text.includes("hp")) return "hp";
  return null;
}

function capitalize(value) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function hasOnlyEmojiOrAnger(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return false;

  if (trimmed === "🤬" || trimmed === "😡" || trimmed === "😠") return true;

  return false;
}

function dedupeSummaryParts(parts) {
  const seen = new Set();
  const result = [];

  for (const part of parts) {
    if (!part) continue;
    if (seen.has(part)) continue;
    seen.add(part);
    result.push(part);
  }

  return result;
}

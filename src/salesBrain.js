import { pool } from "./db.js";

const INTENTS = {
  BUY: "BUY",
  INFO: "INFO",
  SUPPORT: "SUPPORT",
  GREETING: "GREETING",
  UNKNOWN: "UNKNOWN"
};

function detectIntent(text = "") {
  const msg = text.toLowerCase();

  if (msg.includes("precio") || msg.includes("comprar")) return INTENTS.BUY;
  if (msg.includes("hola") || msg.includes("buenas")) return INTENTS.GREETING;
  if (msg.includes("ayuda") || msg.includes("soporte")) return INTENTS.SUPPORT;

  return INTENTS.INFO;
}

function generateReply(intent) {
  switch (intent) {
    case INTENTS.GREETING:
      return "Hola 👋 soy Eva, ¿en qué puedo ayudarte hoy?";

    case INTENTS.BUY:
      return "Perfecto 👍 ¿Qué tipo de laptop estás buscando?";

    case INTENTS.SUPPORT:
      return "Con gusto te ayudo. ¿Cuál es el problema con tu equipo?";

    default:
      return "Cuéntame un poco más para poder ayudarte mejor.";
  }
}

export async function handleInboundMessage(payload) {
  const client = await pool.connect();

  try {
    const { organization_id, phone, message } = payload;

    const intent = detectIntent(message);
    const reply = generateReply(intent);

    const conversation = await client.query(
      `
      INSERT INTO conversations (organization_id, phone)
      VALUES ($1, $2)
      ON CONFLICT (organization_id, phone)
      DO UPDATE SET updated_at = NOW()
      RETURNING id
      `,
      [organization_id, phone]
    );

    const conversationId = conversation.rows[0].id;

    await client.query(
      `
      INSERT INTO messages (
        organization_id,
        conversation_id,
        role,
        content,
        created_at
      )
      VALUES ($1, $2, 'user', $3, NOW())
      `,
      [organization_id, conversationId, message]
    );

    await client.query(
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
      [organization_id, conversationId, reply]
    );

    return {
      reply,
      intent
    };

  } finally {
    client.release();
  }
}

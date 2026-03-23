import pool from "./db.js";
import { generateAIReply } from "./aiReply.js";

export async function handleInboundMessage(payload) {
  try {
    const { organization_id, phone, text } = payload;

    console.log("🧠 EVA inbound:", { phone, text });

    // =============================
    // AI RESPONSE
    // =============================
    let reply = await generateAIReply({
      text,
      stage: "NEW",
      intent: "INFO",
      entities: {},
      summary: ""
    });

    console.log("🔥 AI reply:", reply);

    if (!reply) {
      reply = "Hola 😊 ¿En qué puedo ayudarte hoy?";
    }

    return {
      reply,
      media: []
    };

  } catch (error) {
    console.error("❌ ERROR:", error);
    return {
      reply: "Error procesando mensaje",
      media: []
    };
  }
}

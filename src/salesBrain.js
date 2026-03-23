import pool from "./db.js";

/*
====================================================
HANDLE INBOUND MESSAGE
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

    /*
    =====================================
    🛑 IDEMPOTENCIA INBOUND (P1.4)
    =====================================
    */

    if (message_id) {
      const existing = await pool.query(
        `
        SELECT id
        FROM messages
        WHERE external_message_id = $1
        LIMIT 1
        `,
        [message_id]
      );

      if (existing.rows.length > 0) {
        console.log("⚠️ Duplicate message detected:", message_id);

        return {
          reply: null,
          media: []
        };
      }
    }

    /*
    =====================================
    🧠 TU LÓGICA ACTUAL (NO TOCADA)
    =====================================
    */

    // ⚠️ IMPORTANTE:
    // Aquí deberías tener tu lógica real actual (intents, catalog, etc.)
    // NO la estoy cambiando para no romper nada

    let reply = "Claro 😊 contame un poco más para ayudarte mejor 🙌";

    /*
    =====================================
    💾 GUARDAR MENSAJE (IMPORTANTE PARA IDEMPOTENCIA)
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
      VALUES ($1, $2, $3, $4, NOW())
      `,
      [
        organization_id,
        message_id || null,
        "user",
        text
      ]
    );

    return {
      reply,
      media: []
    };

  } catch (error) {
    console.error("❌ ERROR EN salesBrain:", error);

    return {
      reply: "Hubo un error procesando el mensaje",
      media: []
    };
  }
}

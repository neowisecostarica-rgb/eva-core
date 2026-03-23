import pool from "./db.js";

/*
====================================================
HANDLE INBOUND MESSAGE (MINIMAL SMART BRAIN)
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

    const normalizedText = text?.toLowerCase() || "";

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
        console.log("⚠️ Duplicate message detected:", message_id);

        return {
          reply: null,
          media: []
        };
      }
    }

    /*
    =====================================
    💾 GUARDAR MENSAJE USER
    =====================================
    */

    await pool.query(
      `
      INSERT INTO messages (organization_id, external_message_id, role, content, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      `,
      [organization_id, message_id || null, "user", text]
    );

    /*
    =====================================
    🧠 INTENT DETECTION (BÁSICO)
    =====================================
    */

    let reply = "";

    if (normalizedText.includes("hola") || normalizedText.includes("buenos")) {
      reply = "Hola 😊 con gusto te ayudo. ¿Qué estás buscando exactamente? 🙌";
    }

    else if (normalizedText.includes("laptop") || normalizedText.includes("computadora")) {
      reply = "Claro 😊 tenemos laptops disponibles. ¿La estás buscando para estudio, trabajo o algo más avanzado? 💻";
    }

    else if (normalizedText.includes("precio") || normalizedText.includes("cuánto")) {
      reply = "Con gusto 😊 varían según el modelo, pero tenemos opciones desde ₡115.000 en adelante. ¿Qué tipo de uso le vas a dar? 💻";
    }

    else if (normalizedText.includes("bot")) {
      reply = "Soy Eva 😊 asistente de ventas de Compu Store. Estoy aquí para ayudarte a encontrar la mejor opción según lo que necesites 🙌";
    }

    else {
      reply = "Perfecto 😊 contame un poco más qué estás buscando y te ayudo a encontrar la mejor opción 🙌";
    }

    /*
    =====================================
    💾 GUARDAR MENSAJE ASSISTANT
    =====================================
    */

    await pool.query(
      `
      INSERT INTO messages (organization_id, external_message_id, role, content, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      `,
      [organization_id, null, "assistant", reply]
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

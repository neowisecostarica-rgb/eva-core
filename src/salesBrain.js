import pool from "./db.js";

/*
====================================================
HANDLE INBOUND MESSAGE (SMART MEMORY V1)
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
    🧠 LEER CONTEXTO RECIENTE
    =====================================
    */

    const history = await pool.query(
      `
      SELECT role, content
      FROM messages
      WHERE organization_id = $1
      ORDER BY created_at DESC
      LIMIT 6
      `,
      [organization_id]
    );

    const lastMessages = history.rows.reverse();

    const lastUserMessage = lastMessages
      .filter(m => m.role === "user")
      .slice(-2)[0]?.content?.toLowerCase() || "";

    const previousUserMessage = lastMessages
      .filter(m => m.role === "user")
      .slice(-3)[0]?.content?.toLowerCase() || "";

    /*
    =====================================
    🧠 INTENT + CONTEXTO
    =====================================
    */

    let reply = "";

    // SALUDO
    if (normalizedText.includes("hola") || normalizedText.includes("buenos")) {
      reply = "Hola 😊 con gusto te ayudo. ¿Qué estás buscando exactamente? 🙌";
    }

    // INTERÉS GENERAL
    else if (normalizedText.includes("laptop") || normalizedText.includes("computadora")) {
      reply = "Claro 😊 tenemos laptops disponibles. ¿La estás buscando para estudio, trabajo o algo más avanzado? 💻";
    }

    // CONTEXTO: YA DIJO USO
    else if (
      previousUserMessage.includes("laptop") &&
      (normalizedText.includes("estudio") || normalizedText.includes("clases"))
    ) {
      reply = "Perfecto 😊 para estudio o clases virtuales te recomiendo equipos con 8GB o 16GB de RAM y SSD para mejor velocidad. ¿Te gustaría ver algunas opciones disponibles? 💻";
    }

    // CONTEXTO MÁS AVANZADO
    else if (
      previousUserMessage.includes("estudio") &&
      normalizedText.includes("virtual")
    ) {
      reply = "Excelente 😊 para clases virtuales es importante que el equipo sea rápido y estable. Tenemos varias opciones ideales. ¿Te gustaría que te comparta algunas con precio y fotos? 💻";
    }

    // PRECIO
    else if (normalizedText.includes("precio") || normalizedText.includes("cuánto")) {
      reply = "Con gusto 😊 tenemos opciones desde ₡115.000 en adelante dependiendo del modelo. ¿Qué tipo de uso le vas a dar? 💻";
    }

    // BOT
    else if (normalizedText.includes("bot")) {
      reply = "Soy Eva 😊 asistente de ventas de Compu Store. Estoy aquí para ayudarte a encontrar la mejor opción según lo que necesites 🙌";
    }

    // FALLBACK INTELIGENTE
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

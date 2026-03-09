import pool from "./db.js";

export async function handleInbound({ organization_id, payload }) {

  const message = payload.message || "";
  const phone = payload.phone || "unknown";

  // ---- Heurística mínima (intent / stage / score)
  const text = message.toLowerCase();

  let intent = "UNKNOWN";
  let stage = "DISCOVERY";
  let lead_score = 10;

  if (text.includes("precio") || text.includes("cuesta") || text.includes("cuánto")) {
    intent = "INFO";
    lead_score = 25;
  }

  if (text.includes("comprar") || text.includes("quiero") || text.includes("tienen")) {
    intent = "BUY";
    stage = "QUALIFYING";
    lead_score = 60;
  }

  if (text.includes("estudiar") || text.includes("trabajo") || text.includes("ingeniería")) {
    intent = intent === "UNKNOWN" ? "INFO" : intent;
    lead_score += 10;
  }

  // ---- Respuesta simple por ahora
  const reply = "Perfecto 👍 te puedo ayudar a encontrar una buena opción. ¿Tienes algún presupuesto aproximado?";

  try {

    // 1) buscar o crear conversación
    let conversation = await pool.query(
      `
      SELECT id
      FROM conversations
      WHERE organization_id = $1
      AND external_user_id = $2
      LIMIT 1
      `,
      [organization_id, phone]
    );

    let conversation_id;

    if (conversation.rows.length === 0) {

      const created = await pool.query(
        `
        INSERT INTO conversations (organization_id, external_user_id)
        VALUES ($1,$2)
        RETURNING id
        `,
        [organization_id, phone]
      );

      conversation_id = created.rows[0].id;

    } else {

      conversation_id = conversation.rows[0].id;

    }

    // 2) guardar mensaje usuario
    await pool.query(
      `
      INSERT INTO messages
      (organization_id, conversation_id, role, content)
      VALUES ($1,$2,'user',$3)
      `,
      [organization_id, conversation_id, message]
    );

    // 3) guardar respuesta EVA
    await pool.query(
      `
      INSERT INTO messages
      (organization_id, conversation_id, role, content)
      VALUES ($1,$2,'assistant',$3)
      `,
      [organization_id, conversation_id, reply]
    );

    // 4) LOG DE DECISIÓN (nuevo bloque)
    await pool.query(
      `
      INSERT INTO eva_execution_logs
      (
        organization_id,
        conversation_id,
        external_user_id,
        intent,
        stage,
        lead_score,
        reply
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      `,
      [
        organization_id,
        conversation_id,
        phone,
        intent,
        stage,
        lead_score,
        reply
      ]
    );

    return {
      ok: true,
      reply,
      intent,
      stage,
      lead_score
    };

  } catch (err) {

    console.error("salesBrain error", err);

    return {
      error: "brain_error"
    };

  }
}

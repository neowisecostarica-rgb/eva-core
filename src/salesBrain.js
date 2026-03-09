import pool from "./db.js";

export async function handleInbound({ organization_id, payload }) {

  const message = payload.message || "";

  const phone = payload.phone || "unknown";

  const reply = "Gracias por escribirnos. ¿En qué puedo ayudarte?";

  try {

    const conversation = await pool.query(
      `
      INSERT INTO conversations (organization_id, external_user_id)
      VALUES ($1,$2)
      RETURNING id
      `,
      [organization_id, phone]
    );

    const conversation_id = conversation.rows[0].id;

    await pool.query(
      `
      INSERT INTO messages
      (organization_id, conversation_id, role, content)
      VALUES ($1,$2,'user',$3)
      `,
      [organization_id, conversation_id, message]
    );

    await pool.query(
      `
      INSERT INTO messages
      (organization_id, conversation_id, role, content)
      VALUES ($1,$2,'assistant',$3)
      `,
      [organization_id, conversation_id, reply]
    );

    return {
      ok: true,
      reply
    };

  } catch (err) {

    console.error("salesBrain error", err);

    return {
      error: "brain_error"
    };

  }

}

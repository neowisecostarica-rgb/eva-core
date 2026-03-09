import pool from "./db.js";

// ----------------------------------------------------
// Utilidad: buscar productos relevantes en el catálogo
// ----------------------------------------------------
async function searchCatalog(organization_id, text) {
  const q = `
    SELECT id, name, price_crc, description
    FROM product_catalog
    WHERE organization_id = $1
      AND (
        LOWER(name) LIKE $2
        OR LOWER(description) LIKE $2
        OR LOWER(category) LIKE $2
      )
    ORDER BY name ASC
    LIMIT 3
  `;

  const term = `%${text.toLowerCase()}%`;

  const result = await pool.query(q, [organization_id, term]);
  return result.rows;
}

// ----------------------------------------------------
// Motor principal
// ----------------------------------------------------
export async function handleInbound({ organization_id, payload }) {

  const message = payload.message || "";
  const phone = payload.phone || "unknown";

  const text = message.toLowerCase();

  let intent = "UNKNOWN";
  let stage = "DISCOVERY";
  let lead_score = 10;

  if (text.includes("precio") || text.includes("cuesta")) {
    intent = "INFO";
    lead_score = 30;
  }

  if (text.includes("busco") || text.includes("quiero")) {
    intent = "BUY";
    stage = "QUALIFYING";
    lead_score = 50;
  }

  if (text.includes("laptop") || text.includes("computadora")) {
    intent = "BUY";
    lead_score += 20;
  }

  let reply = "Perfecto 👍 déjame buscar algunas opciones para ti.";

  try {

    // -----------------------------------------
    // Conversación existente o nueva
    // -----------------------------------------
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

    // -----------------------------------------
    // Guardar mensaje usuario
    // -----------------------------------------
    await pool.query(
      `
      INSERT INTO messages
      (organization_id, conversation_id, role, content)
      VALUES ($1,$2,'user',$3)
      `,
      [organization_id, conversation_id, message]
    );

    // -----------------------------------------
    // Buscar productos en el catálogo
    // -----------------------------------------
    let catalogMatches = [];

    if (intent === "BUY" || intent === "INFO") {
      catalogMatches = await searchCatalog(organization_id, text);
    }

    // -----------------------------------------
    // Construir respuesta con productos
    // -----------------------------------------
    if (catalogMatches.length > 0) {

      reply = "Te puedo recomendar estas opciones:\n\n";

      for (const p of catalogMatches) {
        reply += `💻 ${p.name} — ₡${p.price_crc}\n`;
      }

      reply += "\n¿Te gustaría ver fotos o más detalles de alguno?";

    }

    // -----------------------------------------
    // Guardar respuesta EVA
    // -----------------------------------------
    await pool.query(
      `
      INSERT INTO messages
      (organization_id, conversation_id, role, content)
      VALUES ($1,$2,'assistant',$3)
      `,
      [organization_id, conversation_id, reply]
    );

    // -----------------------------------------
    // Registrar decisión del motor
    // -----------------------------------------
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
      lead_score,
      catalog_matches: catalogMatches
    };

  } catch (err) {

    console.error("salesBrain error", err);

    return {
      error: "brain_error"
    };

  }
}

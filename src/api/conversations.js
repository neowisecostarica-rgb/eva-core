// src/api/conversations.js

export function registerConversationRoutes(app, pool) {

  // LISTAR CONVERSACIONES
  app.get("/v1/conversations", async (req, res) => {
    try {

      const r = await pool.query(`
        SELECT
          c.id,
          c.external_user_id,
          c.channel,
          c.control_mode,
          c.created_at,
          m.content AS last_message,
          m.created_at AS last_message_at
        FROM conversations c
        LEFT JOIN LATERAL (
          SELECT content, created_at
          FROM messages
          WHERE conversation_id = c.id
          ORDER BY created_at DESC
          LIMIT 1
        ) m ON true
        ORDER BY m.created_at DESC NULLS LAST
        LIMIT 100
      `);

      res.json(r.rows);

    } catch (err) {

      console.error(err);
      res.status(500).json({ error: "server_error" });

    }
  });


  // MENSAJES DE UNA CONVERSACIÓN
  app.get("/v1/conversations/:id/messages", async (req, res) => {

    try {

      const { id } = req.params;

      const r = await pool.query(`
        SELECT role, content, created_at
        FROM messages
        WHERE conversation_id=$1
        ORDER BY created_at ASC
      `, [id]);

      res.json(r.rows);

    } catch (err) {

      console.error(err);
      res.status(500).json({ error: "server_error" });

    }

  });

}

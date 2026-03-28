// src/api/conversations.js

import { authenticate } from "../lib/auth.js";

export function registerConversationRoutes(app, pool) {

  /*
  ====================================================
  GET /v1/conversations
  ====================================================
  */

  app.get("/v1/conversations", authenticate, async (req, res) => {
    try {

      const organization_id = req.organization_id;

      const r = await pool.query(`
        SELECT
          c.id,
          c.external_user_id,
          c.channel,
          c.control_mode,
          c.created_at,

          -- 🔥 NUEVO MODELO + FALLBACK
          COALESCE(c.last_message, m.text) AS last_message,
          COALESCE(c.last_message_at, m.created_at) AS last_message_at,

          c.updated_at,
          c.score

        FROM conversations c

        LEFT JOIN LATERAL (
          SELECT text, created_at
          FROM messages
          WHERE conversation_id = c.id
          ORDER BY created_at DESC
          LIMIT 1
        ) m ON true

        WHERE c.organization_id = $1

        ORDER BY
          COALESCE(c.updated_at, m.created_at) DESC NULLS LAST

        LIMIT 100
      `, [organization_id]);

      res.json({ success: true, data: r.rows });

    } catch (err) {

      console.error("❌ conversations list error:", err);
      res.status(500).json({ success: false });

    }
  });


  /*
  ====================================================
  GET /v1/conversations/:id
  ====================================================
  */

  app.get("/v1/conversations/:id", authenticate, async (req, res) => {
    try {

      const { id } = req.params;
      const organization_id = req.organization_id;

      const r = await pool.query(`
        SELECT *
        FROM conversations
        WHERE id = $1 AND organization_id = $2
        LIMIT 1
      `, [id, organization_id]);

      res.json({ success: true, data: r.rows[0] || null });

    } catch (err) {

      console.error("❌ conversation detail error:", err);
      res.status(500).json({ success: false });

    }
  });


  /*
  ====================================================
  GET /v1/conversations/:id/messages
  ====================================================
  */

  app.get("/v1/conversations/:id/messages", authenticate, async (req, res) => {
    try {

      const { id } = req.params;
      const organization_id = req.organization_id;

      const r = await pool.query(`
        SELECT m.role, m.text, m.created_at
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE m.conversation_id = $1
        AND c.organization_id = $2
        ORDER BY m.created_at ASC
      `, [id, organization_id]);

      res.json({ success: true, data: r.rows });

    } catch (err) {

      console.error("❌ messages error:", err);
      res.status(500).json({ success: false });

    }
  });


  /*
  ====================================================
  POST /v1/conversations/:id/messages
  ====================================================
  */

  app.post("/v1/conversations/:id/messages", authenticate, async (req, res) => {
    try {

      const { id } = req.params;
      const { content } = req.body;
      const organization_id = req.organization_id;

      if (!content) {
        return res.status(400).json({ success: false, error: "Content required" });
      }

      // validar conversación
      const conv = await pool.query(`
        SELECT *
        FROM conversations
        WHERE id = $1 AND organization_id = $2
        LIMIT 1
      `, [id, organization_id]);

      const conversation = conv.rows[0];

      if (!conversation) {
        return res.status(404).json({ success: false, error: "Conversation not found" });
      }

      // guardar mensaje
      const msg = await pool.query(`
        INSERT INTO messages (conversation_id, role, text, created_at)
        VALUES ($1, 'assistant', $2, NOW())
        RETURNING *
      `, [id, content]);

      const message = msg.rows[0];

      // 🔥 ACTUALIZAR ESTADO DE CONVERSACIÓN (CONTRATO EVA v1)
      await pool.query(
        `
        UPDATE conversations
        SET
          last_message = $1,
          last_message_at = NOW(),
          updated_at = NOW()
        WHERE id = $2
        `,
        [content, id]
      );

      // enviar WhatsApp si aplica
      if (conversation.channel === "whatsapp") {
        try {
          const { sendWhatsAppMessage } = await import("../connectors/whatsapp.js");

          await sendWhatsAppMessage({
            to: conversation.external_user_id,
            text: content
          });

        } catch (err) {
          console.error("⚠️ WhatsApp send error:", err);
        }
      }

      res.json({ success: true, data: message });

    } catch (err) {

      console.error("❌ send message error:", err);
      res.status(500).json({ success: false });

    }
  });

}

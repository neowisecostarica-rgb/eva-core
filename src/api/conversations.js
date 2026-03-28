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

      const r = await pool.query(
        `
        SELECT
          id,
          organization_id,
          external_user_id,
          channel,
          control_mode,
          stage,
          lead_score,
          summary,
          last_message,
          last_message_at,
          created_at,
          updated_at
        FROM conversations
        WHERE organization_id = $1
        ORDER BY COALESCE(last_message_at, created_at) DESC
        LIMIT 50
        `,
        [organization_id]
      );

      return res.json({
        success: true,
        data: r.rows,
      });
    } catch (err) {
      console.error("❌ conversations list error:", err);
      return res.status(500).json({
        success: false,
        error: "Error listing conversations",
      });
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

      const r = await pool.query(
        `
        SELECT
          id,
          organization_id,
          external_user_id,
          channel,
          control_mode,
          stage,
          lead_score,
          summary,
          last_message,
          last_message_at,
          created_at,
          updated_at
        FROM conversations
        WHERE id = $1
          AND organization_id = $2
        LIMIT 1
        `,
        [id, organization_id]
      );

      return res.json({
        success: true,
        data: r.rows[0] || null,
      });
    } catch (err) {
      console.error("❌ conversation detail error:", err);
      return res.status(500).json({
        success: false,
        error: "Error fetching conversation",
      });
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

      const r = await pool.query(
        `
        SELECT
          m.id,
          m.conversation_id,
          m.role,
          m.text,
          m.created_at
        FROM messages m
        JOIN conversations c
          ON c.id = m.conversation_id
        WHERE m.conversation_id = $1
          AND c.organization_id = $2
        ORDER BY m.created_at ASC
        `,
        [id, organization_id]
      );

      return res.json({
        success: true,
        data: r.rows,
      });
    } catch (err) {
      console.error("❌ messages error:", err);
      return res.status(500).json({
        success: false,
        error: "Error fetching conversation messages",
      });
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

      const cleanContent = String(content || "").trim();

      if (!cleanContent) {
        return res.status(400).json({
          success: false,
          error: "Content required",
        });
      }

      const conv = await pool.query(
        `
        SELECT
          id,
          organization_id,
          external_user_id,
          channel
        FROM conversations
        WHERE id = $1
          AND organization_id = $2
        LIMIT 1
        `,
        [id, organization_id]
      );

      const conversation = conv.rows[0];

      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: "Conversation not found",
        });
      }

      const msg = await pool.query(
        `
        INSERT INTO messages (
          conversation_id,
          role,
          text,
          created_at
        )
        VALUES ($1, 'assistant', $2, NOW())
        RETURNING
          id,
          conversation_id,
          role,
          text,
          created_at
        `,
        [id, cleanContent]
      );

      const message = msg.rows[0];

      await pool.query(
        `
        UPDATE conversations
        SET
          last_message = $1,
          last_message_at = NOW(),
          updated_at = NOW()
        WHERE id = $2
          AND organization_id = $3
        `,
        [cleanContent, id, organization_id]
      );

      let delivery = {
        attempted: false,
        channel: conversation.channel,
        sent: false,
      };

      if (conversation.channel === "whatsapp") {
        delivery.attempted = true;

        try {
          const { sendWhatsAppMessage } = await import("../connectors/whatsapp.js");

          await sendWhatsAppMessage({
            to: conversation.external_user_id,
            text: cleanContent,
          });

          delivery.sent = true;
        } catch (err) {
          delivery.sent = false;
          console.error("⚠️ WhatsApp send error:", err);
        }
      }

      return res.json({
        success: true,
        data: {
          message,
          delivery,
        },
      });
    } catch (err) {
      console.error("❌ send message error:", err);
      return res.status(500).json({
        success: false,
        error: "Error sending message",
      });
    }
  });
}

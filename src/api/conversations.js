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
          id,
          external_user_id,
          channel,
          control_mode,
          summary,
          stage,
          lead_score,
          last_message,
          last_message_at,
          created_at,
          updated_at
        FROM conversations
        WHERE organization_id = $1
        ORDER BY updated_at DESC
        LIMIT 50
      `, [organization_id]);

      res.json({
        success: true,
        data: r.rows
      });

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
      const organization_id = req.organization_id;
      const { id } = req.params;

      const r = await pool.query(`
        SELECT
          id,
          external_user_id,
          channel,
          control_mode,
          summary,
          stage,
          lead_score,
          last_message,
          last_message_at,
          created_at,
          updated_at
        FROM conversations
        WHERE id = $1
        AND organization_id = $2
        LIMIT 1
      `, [id, organization_id]);

      if (r.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Conversation not found"
        });
      }

      res.json({
        success: true,
        data: r.rows[0]
      });

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
      const organization_id = req.organization_id;
      const { id } = req.params;

      const r = await pool.query(`
        SELECT
          id,
          role,
          content,
          created_at
        FROM messages
        WHERE conversation_id = $1
        AND organization_id = $2
        ORDER BY created_at ASC
      `, [id, organization_id]);

      res.json({
        success: true,
        data: r.rows
      });

    } catch (err) {
      console.error("❌ messages list error:", err);
      res.status(500).json({ success: false });
    }
  });


  /*
  ====================================================
  POST /v1/conversations/:id/messages
  (enviar mensaje manual desde dashboard)
  ====================================================
  */

  app.post("/v1/conversations/:id/messages", authenticate, async (req, res) => {
    try {
      const organization_id = req.organization_id;
      const { id } = req.params;
      const { content, sender = "user" } = req.body;

      if (!content) {
        return res.status(400).json({
          success: false,
          error: "Content required"
        });
      }

      const r = await pool.query(`
        INSERT INTO messages (
          conversation_id,
          organization_id,
          role,
          content,
          created_at
        )
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING *
      `, [id, organization_id, sender, content]);

      res.json({
        success: true,
        data: r.rows[0]
      });

    } catch (err) {
      console.error("❌ send message error:", err);
      res.status(500).json({ success: false });
    }
  });

}

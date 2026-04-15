// src/api/conversations.js

import { authenticate } from "../lib/auth.js";

function classifyScore(score = 0) {
  if (score >= 85) return "READY";
  if (score >= 65) return "HOT";
  if (score >= 40) return "WARM";
  return "COLD";
}

export function registerConversationRoutes(app, pool) {

  function getOrg(req) {
    if (!req.organization_id) {
      throw new Error("organization_id missing in request (auth failed)");
    }
    return req.organization_id;
  }

  /*
  ====================================================
  GET /v1/conversations (ENRICHED)
  ====================================================
  */

  app.get("/v1/conversations", authenticate, async (req, res) => {
    try {
      const organization_id = getOrg(req);

      const r = await pool.query(`
        SELECT
          c.id,
          c.external_user_id,
          c.channel,
          c.control_mode,
          c.summary,
          c.stage,
          c.last_message,
          c.last_message_at,
          c.created_at,
          c.updated_at,
          l.score,
          l.last_contact_at
        FROM conversations c
        LEFT JOIN leads l
          ON l.phone = c.external_user_id
          AND l.organization_id = c.organization_id
        WHERE c.organization_id = $1
        ORDER BY c.updated_at DESC
        LIMIT 50
      `, [organization_id]);

      const enriched = r.rows.map((c) => {
        const label = classifyScore(c.score || 0);

        let urgency = "LOW";
        if (c.score >= 85) urgency = "HIGH";
        else if (c.score >= 65) urgency = "MEDIUM";

        return {
          ...c,
          score: c.score || 0,
          label,
          urgency,
        };
      });

      res.json({ success: true, data: enriched });

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
      const organization_id = getOrg(req);
      const { id } = req.params;

      const r = await pool.query(`
        SELECT *
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

      res.json({ success: true, data: r.rows[0] });

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
      const organization_id = getOrg(req);
      const { id } = req.params;

      const r = await pool.query(`
        SELECT id, role, content, created_at
        FROM messages
        WHERE conversation_id = $1
        AND organization_id = $2
        ORDER BY created_at ASC
      `, [id, organization_id]);

      res.json({ success: true, data: r.rows });

    } catch (err) {
      console.error("❌ messages list error:", err);
      res.status(500).json({ success: false });
    }
  });

}

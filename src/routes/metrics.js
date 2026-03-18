/*
====================================================
EVA METRICS API (SECURE MULTI-TENANT)
====================================================
*/

import express from "express";
import pool from "../db.js";
import {
  authenticateApiKey,
  requireOrganizationMatch,
  allowLabOrganizationFallback
} from "../lib/auth.js";

const router = express.Router();

/*
====================================================
MIDDLEWARE STACK
====================================================
*/

router.use(authenticateApiKey);
router.use(requireOrganizationMatch);
router.use(allowLabOrganizationFallback);

/*
====================================================
GET /v1/metrics/summary
====================================================
*/

router.get("/summary", async (req, res) => {

  try {

    const organization_id = req.organization_id;

    if (!organization_id) {
      return res.status(400).json({
        success: false,
        error: "organization_not_resolved"
      });
    }

    /*
    ====================================================
    METRICS QUERY
    ====================================================
    */

    const result = await pool.query(
      `
      SELECT
        COUNT(DISTINCT c.id) AS total_conversations,
        COUNT(m.id) AS total_messages,
        COUNT(DISTINCT l.id) AS total_leads,

        COUNT(*) FILTER (WHERE l.interest_level = 'HIGH') AS high_intent_leads,
        COUNT(*) FILTER (WHERE l.status = 'closed') AS closed_leads,

        MAX(c.updated_at) AS last_activity

      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      LEFT JOIN leads l ON l.id = c.lead_id

      WHERE c.organization_id = $1
      `,
      [organization_id]
    );

    const row = result.rows?.[0] || {};

    /*
    ====================================================
    RESPONSE
    ====================================================
    */

    return res.json({
      success: true,
      data: {
        total_conversations: Number(row.total_conversations || 0),
        total_messages: Number(row.total_messages || 0),
        total_leads: Number(row.total_leads || 0),
        high_intent_leads: Number(row.high_intent_leads || 0),
        closed_leads: Number(row.closed_leads || 0),
        last_activity: row.last_activity || null
      }
    });

  } catch (err) {

    console.error("❌ metrics error:", err.message);

    return res.status(500).json({
      success: false,
      error: "metrics_error"
    });
  }
});

export default router;

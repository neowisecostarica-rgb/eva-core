/*
====================================================
EVA METRICS API (FULL HARDENED VERSION)
====================================================
*/

import express from "express";
import pool from "../db.js";

/*
AUTH
*/
import {
  authenticateApiKey,
  requireOrganizationMatch,
  allowLabOrganizationFallback
} from "../lib/auth.js";

/*
SECURITY
*/
import {
  metricsApiRateLimit,
  basicSecurityHeaders
} from "../lib/security.js";

const router = express.Router();

/*
====================================================
GLOBAL MIDDLEWARE STACK
====================================================
*/

router.use(basicSecurityHeaders);

router.use(authenticateApiKey);
router.use(requireOrganizationMatch);
router.use(allowLabOrganizationFallback);

router.use(metricsApiRateLimit);

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
    BASIC COUNTS
    ====================================================
    */

    const [conversations, leads] = await Promise.all([
      pool.query(
        `
        SELECT COUNT(*)::int AS total
        FROM conversations
        WHERE organization_id = $1
        `,
        [organization_id]
      ),
      pool.query(
        `
        SELECT COUNT(*)::int AS total
        FROM leads
        WHERE organization_id = $1
        `,
        [organization_id]
      )
    ]);

    /*
    ====================================================
    HOT LEADS
    ====================================================
    */

    const hotLeads = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM leads
      WHERE organization_id = $1
        AND stage = 'hot'
      `,
      [organization_id]
    );

    /*
    ====================================================
    WON LEADS
    ====================================================
    */

    const wonLeads = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM leads
      WHERE organization_id = $1
        AND stage = 'won'
      `,
      [organization_id]
    );

    /*
    ====================================================
    FOLLOWUPS PENDING
    ====================================================
    */

    const followups = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM followups
      WHERE organization_id = $1
        AND status = 'pending'
      `,
      [organization_id]
    );

    /*
    ====================================================
    SAFE CONVERSION RATE
    ====================================================
    */

    const totalLeads = leads.rows[0]?.total || 0;
    const totalWon = wonLeads.rows[0]?.total || 0;

    const conversionRate =
      totalLeads > 0
        ? ((totalWon / totalLeads) * 100).toFixed(2)
        : "0.00";

    /*
    ====================================================
    RESPONSE
    ====================================================
    */

    return res.json({
      success: true,
      data: {
        conversations: conversations.rows[0]?.total || 0,
        leads: totalLeads,
        hot_leads: hotLeads.rows[0]?.total || 0,
        won_leads: totalWon,
        followups_pending: followups.rows[0]?.total || 0,
        conversion_rate: `${conversionRate}%`
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

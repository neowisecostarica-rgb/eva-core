/*
====================================================
EVA METRICS API (CLEAN + CONSISTENT)
====================================================
*/

import express from "express";
import pool from "../db.js";

const router = express.Router();

/*
====================================================
GET /v1/metrics/summary
====================================================
*/

router.get("/summary", async (req, res) => {

  try {

    const organization_id =
      req.query.organization_id ||
      req.headers["x-organization-id"] ||
      process.env.DEFAULT_ORGANIZATION_ID;

    if (!organization_id) {
      return res.status(400).json({
        error: "organization_id is required"
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
    HOT LEADS (STAGE REAL)
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
    WON LEADS (CIERRES)
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
    FOLLOWUPS PENDIENTES
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
    CONVERSION RATE (SAFE)
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

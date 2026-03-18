/*
====================================================
EVA METRICS ROUTES
====================================================
*/

import express from "express";
import pool from "../db.js";

const router = express.Router();

/*
====================================================
SUMMARY METRICS
====================================================
*/

router.get("/summary", async (req, res) => {
  try {
    const { organization_id } = req.query;

    if (!organization_id) {
      return res.status(400).json({
        error: "organization_id required"
      });
    }

    /*
    ====================================================
    LEADS
    ====================================================
    */

    const leadsResult = await pool.query(`
      SELECT COUNT(*) AS total_leads
      FROM leads
      WHERE organization_id = $1
    `, [organization_id]);

    /*
    ====================================================
    HIGH INTENT (aproximado)
    ====================================================
    */

    const highIntentResult = await pool.query(`
      SELECT COUNT(*) AS high_intent
      FROM sales_intelligence_events
      WHERE organization_id = $1
      AND event_type = 'BUY_INTENT'
    `, [organization_id]);

    /*
    ====================================================
    PRICE OBJECTIONS
    ====================================================
    */

    const priceResult = await pool.query(`
      SELECT COUNT(*) AS price_objections
      FROM sales_intelligence_events
      WHERE organization_id = $1
      AND event_type = 'PRICE_OBJECTION'
    `, [organization_id]);

    /*
    ====================================================
    USE CASE DISTRIBUTION
    ====================================================
    */

    const useCaseResult = await pool.query(`
      SELECT event_type, COUNT(*) as count
      FROM sales_intelligence_events
      WHERE organization_id = $1
      AND event_type IN ('USE_CASE_ESTUDIO', 'USE_CASE_TRABAJO')
      GROUP BY event_type
    `, [organization_id]);

    /*
    ====================================================
    LOW PRICE SEARCH
    ====================================================
    */

    const lowPriceResult = await pool.query(`
      SELECT COUNT(*) AS low_price_search
      FROM sales_intelligence_events
      WHERE organization_id = $1
      AND event_type = 'LOW_PRICE_SEARCH'
    `, [organization_id]);

    /*
    ====================================================
    RESPONSE
    ====================================================
    */

    return res.json({
      success: true,
      data: {
        total_leads: Number(leadsResult.rows[0]?.total_leads || 0),
        high_intent: Number(highIntentResult.rows[0]?.high_intent || 0),
        price_objections: Number(priceResult.rows[0]?.price_objections || 0),
        low_price_search: Number(lowPriceResult.rows[0]?.low_price_search || 0),
        use_cases: useCaseResult.rows || []
      }
    });

  } catch (err) {
    console.error("❌ metrics error:", err.message);

    return res.status(500).json({
      error: "metrics failed"
    });
  }
});

export default router;

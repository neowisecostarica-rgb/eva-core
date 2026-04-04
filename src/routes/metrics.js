/*
====================================================
EVA METRICS ROUTES (ALINEADO A AUTH + SOT)
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
    const organization_id = req.organization?.id;

    if (!organization_id) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    const leadsResult = await pool.query(
      `SELECT COUNT(*) FROM leads WHERE organization_id = $1`,
      [organization_id]
    );

    const conversationsResult = await pool.query(
      `SELECT COUNT(*) FROM conversations WHERE organization_id = $1`,
      [organization_id]
    );

    const messagesResult = await pool.query(
      `SELECT COUNT(*) FROM messages WHERE organization_id = $1`,
      [organization_id]
    );

    // ================================
    // PIPELINE EVENTS
    // ================================
    const eventsResult = await pool.query(
      `
      SELECT event_type, COUNT(*) as count
      FROM pipeline_events
      WHERE organization_id = $1
      GROUP BY event_type
      `,
      [organization_id]
    );

    const eventMap = {};
    for (const row of eventsResult.rows) {
      eventMap[row.event_type] = Number(row.count);
    }

    return res.json({
      success: true,
      data: {
        leads: Number(leadsResult.rows[0].count || 0),
        conversations: Number(conversationsResult.rows[0].count || 0),
        messages: Number(messagesResult.rows[0].count || 0),

        funnel: {
          intents: eventMap["intent_detected"] || 0,
          price_interest: eventMap["price_interest"] || 0,
          high_intent: eventMap["high_intent"] || 0,
          availability_check: eventMap["availability_check"] || 0,
        },

        followups: {
          created: eventMap["followup_created"] || 0,
        },
      },
    });
  } catch (err) {
    console.error("METRICS SUMMARY ERROR", err);
    return res.status(500).json({
      error: "internal_error",
    });
  }
});

/*
====================================================
RADAR
====================================================
*/

router.get("/radar", async (req, res) => {
  try {
    const organization_id = req.organization?.id;

    if (!organization_id) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    const signalsResult = await pool.query(
      `
      SELECT event_type, COUNT(*) as count
      FROM sales_intelligence_events
      WHERE organization_id = $1
      GROUP BY event_type
      `,
      [organization_id]
    );

    const signalsMap = {};
    for (const row of signalsResult.rows) {
      signalsMap[row.event_type] = Number(row.count);
    }

    const productDemandResult = await pool.query(
      `
      SELECT event_value, COUNT(*) as count
      FROM sales_intelligence_events
      WHERE organization_id = $1
      AND event_type = 'PRODUCT_DEMAND'
      GROUP BY event_value
      ORDER BY count DESC
      `,
      [organization_id]
    );

    const productInterestResult = await pool.query(
      `
      SELECT event_value, COUNT(*) as count
      FROM sales_intelligence_events
      WHERE organization_id = $1
      AND event_type = 'PRODUCT_SEARCH'
      GROUP BY event_value
      ORDER BY count DESC
      `,
      [organization_id]
    );

    return res.json({
      success: true,
      data: {
        signals: {
          use_case_estudio: signalsMap["USE_CASE_ESTUDIO"] || 0,
          use_case_trabajo: signalsMap["USE_CASE_TRABAJO"] || 0,
          buy_intent: signalsMap["BUY_INTENT"] || 0,
          price_objections: signalsMap["PRICE_OBJECTION"] || 0,
          low_price_search: signalsMap["LOW_PRICE_SEARCH"] || 0,
          product_search: signalsMap["PRODUCT_SEARCH"] || 0,
          budget_detected: signalsMap["BUDGET_DETECTED"] || 0,
        },
        product_demand: productDemandResult.rows || [],
        product_interest: productInterestResult.rows || [],
      },
    });
  } catch (err) {
    console.error("RADAR ERROR", err);
    return res.status(500).json({
      error: "internal_error",
    });
  }
});

export default router;

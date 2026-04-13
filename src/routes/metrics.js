/*
====================================================
EVA CORE — METRICS ROUTES (Sales Radar + Conversion vNext)
====================================================
*/

import express from "express";
import pool from "../db.js";

const router = express.Router();

/*
====================================================
SUMMARY (CONVERSION + FUNNEL REAL)
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

    /*
    ========================================
    BASE COUNTS
    ========================================
    */

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

    /*
    ========================================
    PIPELINE EVENTS
    ========================================
    */

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

    /*
    ========================================
    FUNNEL (REAL)
    ========================================
    */

    const intents = eventMap["intent_detected"] || 0;
    const highIntent = eventMap["high_intent"] || 0;
    const priceInterest = eventMap["price_interest"] || 0;
    const followups = eventMap["followup_created"] || 0;

    /*
    ========================================
    CONVERSION RATES
    ========================================
    */

    const leadCount = Number(leadsResult.rows[0].count || 0);
    const conversationCount = Number(conversationsResult.rows[0].count || 0);

    const intentRate = leadCount ? intents / leadCount : 0;
    const highIntentRate = intents ? highIntent / intents : 0;

    /*
    ========================================
    RESPONSE
    ========================================
    */

    return res.json({
      success: true,
      data: {
        counts: {
          leads: leadCount,
          conversations: conversationCount,
          messages: Number(messagesResult.rows[0].count || 0),
        },

        funnel: {
          intents,
          high_intent: highIntent,
          price_interest: priceInterest,
          followups,
        },

        conversion: {
          intent_rate: Number(intentRate.toFixed(2)),
          high_intent_rate: Number(highIntentRate.toFixed(2)),
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
RADAR (DEMANDA + INTELIGENCIA)
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

    /*
    ========================================
    DEMANDA POR PRODUCTO (REAL)
    ========================================
    */

    const demandResult = await pool.query(
      `
      SELECT product_interest, COUNT(*) as count
      FROM leads
      WHERE organization_id = $1
        AND product_interest IS NOT NULL
      GROUP BY product_interest
      ORDER BY count DESC
      `,
      [organization_id]
    );

    /*
    ========================================
    USO (USE CASE)
    ========================================
    */

    const useCaseResult = await pool.query(
      `
      SELECT use_case, COUNT(*) as count
      FROM leads
      WHERE organization_id = $1
        AND use_case IS NOT NULL
      GROUP BY use_case
      ORDER BY count DESC
      `,
      [organization_id]
    );

    /*
    ========================================
    PRESUPUESTO DETECTADO
    ========================================
    */

    const budgetResult = await pool.query(
      `
      SELECT COUNT(*) 
      FROM leads
      WHERE organization_id = $1
        AND budget IS NOT NULL
      `,
      [organization_id]
    );

    /*
    ========================================
    RESPONSE
    ========================================
    */

    return res.json({
      success: true,
      data: {
        demand: demandResult.rows || [],
        use_cases: useCaseResult.rows || [],
        budget_detected: Number(budgetResult.rows[0].count || 0),
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

/*
====================================================
EVA CORE — METRICS ROUTES (Sales Radar + Conversion + Dashboard vNext)
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
      return res.status(401).json({ error: "Unauthorized" });
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

    const intents = eventMap["intent_detected"] || 0;
    const highIntent = eventMap["HIGH_INTENT"] || 0;
    const followups = eventMap["followup_created"] || 0;

    const leadCount = Number(leadsResult.rows[0].count || 0);

    const intentRate = leadCount ? intents / leadCount : 0;
    const highIntentRate = intents ? highIntent / intents : 0;

    return res.json({
      success: true,
      data: {
        counts: {
          leads: leadCount,
          conversations: Number(conversationsResult.rows[0].count || 0),
          messages: Number(messagesResult.rows[0].count || 0),
        },
        funnel: {
          intents,
          high_intent: highIntent,
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
    return res.status(500).json({ error: "internal_error" });
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
      return res.status(401).json({ error: "Unauthorized" });
    }

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

    const budgetResult = await pool.query(
      `
      SELECT COUNT(*) 
      FROM leads
      WHERE organization_id = $1
        AND budget IS NOT NULL
      `,
      [organization_id]
    );

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
    return res.status(500).json({ error: "internal_error" });
  }
});

/*
====================================================
🔥 DASHBOARD — COMMERCIAL INTELLIGENCE
====================================================
*/

router.get("/dashboard", async (req, res) => {
  try {
    const organization_id = req.organization?.id;

    if (!organization_id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const scoreDist = await pool.query(`
      SELECT
        CASE
          WHEN score >= 85 THEN 'READY'
          WHEN score >= 65 THEN 'HOT'
          WHEN score >= 40 THEN 'WARM'
          ELSE 'COLD'
        END as bucket,
        COUNT(*) as total
      FROM leads
      WHERE organization_id = $1
      GROUP BY bucket
    `, [organization_id]);

    const activeLeads = await pool.query(`
      SELECT COUNT(*) as total
      FROM leads
      WHERE organization_id = $1
      AND last_contact_at > NOW() - INTERVAL '24 hours'
    `, [organization_id]);

    const riskLeads = await pool.query(`
      SELECT COUNT(*) as total
      FROM leads
      WHERE organization_id = $1
      AND last_contact_at < NOW() - INTERVAL '48 hours'
    `, [organization_id]);

    const readyLeads = await pool.query(`
      SELECT COUNT(*) as total
      FROM leads
      WHERE organization_id = $1
      AND score >= 85
    `, [organization_id]);

    const stageDist = await pool.query(`
      SELECT stage, COUNT(*) as total
      FROM leads
      WHERE organization_id = $1
      GROUP BY stage
    `, [organization_id]);

    const recentEvents = await pool.query(`
      SELECT event_type, COUNT(*) as total
      FROM pipeline_events
      WHERE organization_id = $1
      AND created_at > NOW() - INTERVAL '24 hours'
      GROUP BY event_type
    `, [organization_id]);

    return res.json({
      success: true,
      data: {
        score_distribution: scoreDist.rows,
        active_leads: Number(activeLeads.rows[0]?.total || 0),
        at_risk_leads: Number(riskLeads.rows[0]?.total || 0),
        ready_to_close: Number(readyLeads.rows[0]?.total || 0),
        stage_distribution: stageDist.rows,
        recent_events: recentEvents.rows,
      },
    });

  } catch (err) {
    console.error("DASHBOARD ERROR", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;

import express from "express";
import pool from "../db.js";
import { authenticate } from "../lib/auth.js";

const router = express.Router();

router.get("/summary", authenticate, async (req, res) => {

  try {

    const organization_id = req.organization.id;

    const conversations = await pool.query(
      `
      SELECT COUNT(*)
      FROM conversations
      WHERE organization_id=$1
      `,
      [organization_id]
    );

    const leads = await pool.query(
      `
      SELECT COUNT(*)
      FROM leads
      WHERE organization_id=$1
      `,
      [organization_id]
    );

    const conversationsToday = await pool.query(
      `
      SELECT COUNT(*)
      FROM conversations
      WHERE organization_id=$1
      AND created_at >= CURRENT_DATE
      `,
      [organization_id]
    );

    const hotLeads = await pool.query(
      `
      SELECT COUNT(*)
      FROM leads
      WHERE organization_id=$1
      AND interest_level='HIGH'
      `,
      [organization_id]
    );

    const followupsPending = await pool.query(
      `
      SELECT COUNT(*)
      FROM followups
      WHERE organization_id=$1
      AND status='pending'
      `,
      [organization_id]
    );

    res.json({

      conversations: conversations.rows[0].count,
      leads: leads.rows[0].count,
      conversations_today: conversationsToday.rows[0].count,
      hot_leads: hotLeads.rows[0].count,
      followups_pending: followupsPending.rows[0].count

    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: "metrics_error"
    });

  }

});

export default router;

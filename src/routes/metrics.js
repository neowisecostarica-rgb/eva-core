import express from "express";
import pool from "../db.js";
import { authenticate } from "../lib/auth.js";

const router = express.Router();

router.get("/summary", authenticate, async (req, res) => {

  try {

    const organization_id = req.organization.id;

    const conversations = await pool.query(
      `SELECT COUNT(*) FROM conversations WHERE organization_id=$1`,
      [organization_id]
    );

    const leads = await pool.query(
      `SELECT COUNT(*) FROM leads WHERE organization_id=$1`,
      [organization_id]
    );

    res.json({
      conversations: conversations.rows[0].count,
      leads: leads.rows[0].count
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: "metrics_error"
    });

  }

});

export default router;

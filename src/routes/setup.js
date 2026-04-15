/*
====================================================
EVA CORE — SETUP ROUTES (SOT)
====================================================
*/

import express from "express";
import pool from "../db.js";
import { authenticate } from "../lib/auth.js";

const router = express.Router();

/*
====================================================
GET BUSINESS PROFILE
====================================================
*/
router.get("/business-profile", authenticate, async (req, res) => {
  try {
    const orgId = req.organization_id;

    const { rows } = await pool.query(
      `
      SELECT *
      FROM business_profile
      WHERE organization_id = $1
      LIMIT 1
      `,
      [orgId]
    );

    return res.json({
      success: true,
      data: rows[0] || null,
    });

  } catch (err) {
    console.error("❌ GET business_profile:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/*
====================================================
UPSERT BUSINESS PROFILE
====================================================
*/
router.put("/business-profile", authenticate, async (req, res) => {
  try {
    const orgId = req.organization_id;
    const payload = req.body;

    const { rows } = await pool.query(
      `
      INSERT INTO business_profile (
        organization_id,
        business_name,
        sinpe_number,
        bank_name,
        delivery_available,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (organization_id)
      DO UPDATE SET
        business_name = EXCLUDED.business_name,
        sinpe_number = EXCLUDED.sinpe_number,
        bank_name = EXCLUDED.bank_name,
        delivery_available = EXCLUDED.delivery_available,
        updated_at = NOW()
      RETURNING *
      `,
      [
        orgId,
        payload.business_name || null,
        payload.sinpe_number || null,
        payload.bank_name || null,
        payload.delivery_available || false,
      ]
    );

    return res.json({
      success: true,
      data: rows[0],
    });

  } catch (err) {
    console.error("❌ UPSERT business_profile:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/*
====================================================
GET PROMPT CONFIG (EVA PERSONA)
====================================================
*/
router.get("/prompt-config", authenticate, async (req, res) => {
  try {
    const orgId = req.organization_id;

    const { rows } = await pool.query(
      `
      SELECT *
      FROM prompt_config
      WHERE organization_id = $1
      LIMIT 1
      `,
      [orgId]
    );

    return res.json({
      success: true,
      data: rows[0] || null,
    });

  } catch (err) {
    console.error("❌ GET prompt_config:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/*
====================================================
UPSERT PROMPT CONFIG
====================================================
*/
router.put("/prompt-config", authenticate, async (req, res) => {
  try {
    const orgId = req.organization_id;
    const payload = req.body;

    const { rows } = await pool.query(
      `
      INSERT INTO prompt_config (
        organization_id,
        agent_name,
        assistant_name,
        tone,
        emoji_policy,
        communication_style,
        restrictions,
        closing_style,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (organization_id)
      DO UPDATE SET
        agent_name = EXCLUDED.agent_name,
        assistant_name = EXCLUDED.assistant_name,
        tone = EXCLUDED.tone,
        emoji_policy = EXCLUDED.emoji_policy,
        communication_style = EXCLUDED.communication_style,
        restrictions = EXCLUDED.restrictions,
        closing_style = EXCLUDED.closing_style,
        updated_at = NOW()
      RETURNING *
      `,
      [
        orgId,
        payload.agent_name || null,
        payload.assistant_name || null,
        payload.tone || null,
        payload.emoji_policy || null,
        payload.communication_style || null,
        payload.restrictions || null,
        payload.closing_style || null,
      ]
    );

    return res.json({
      success: true,
      data: rows[0],
    });

  } catch (err) {
    console.error("❌ UPSERT prompt_config:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

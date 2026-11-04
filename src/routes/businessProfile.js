import express from "express";
import db from "../db.js";
import { authenticate } from "../lib/auth.js";
import { buildBusinessProfileUpdate } from "../lib/businessProfilePolicy.js";

const router = express.Router();

/*
====================================================
GET BUSINESS PROFILE
====================================================
*/
router.get("/", authenticate, async (req, res) => {
  try {
    const organization_id = req.organization_id;

    if (!organization_id) {
      return res.status(400).json({
        success: false,
        error: "organization_id requerido"
      });
    }

    const result = await db.query(
      `
      SELECT *
      FROM business_profile
      WHERE organization_id = $1
      LIMIT 1
      `,
      [organization_id]
    );

    return res.json({
      success: true,
      data: result.rows[0] || null
    });

  } catch (err) {
    console.error("❌ GET business_profile error:", err);

    return res.status(500).json({
      success: false,
      error: "Error interno"
    });
  }
});

/*
====================================================
UPDATE BUSINESS PROFILE
====================================================
*/
router.patch("/", authenticate, async (req, res) => {
  try {
    const organization_id = req.organization_id;
    const update = buildBusinessProfileUpdate(req.body, organization_id);
    if (!update.ok) {
      return res.status(400).json({ success: false, error: update.error });
    }

    const { query, values } = update;

    const result = await db.query(query, values);

    return res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (err) {
    console.error("❌ UPDATE business_profile error:", err);

    return res.status(500).json({
      success: false,
      error: "Error interno"
    });
  }
});

export default router;

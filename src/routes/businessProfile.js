import express from "express";
import db from "../db.js";

const router = express.Router();

/*
====================================================
GET BUSINESS PROFILE
====================================================
*/
router.get("/", async (req, res) => {
  try {
    const organization_id = req.headers["x-eva-org-id"];

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
router.patch("/", async (req, res) => {
  try {
    const organization_id = req.headers["x-eva-org-id"];
    const payload = req.body;

    const fields = Object.keys(payload);

    if (!organization_id || fields.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Datos incompletos"
      });
    }

    const setClause = fields
      .map((f, i) => `${f} = $${i + 2}`)
      .join(", ");

    const values = [organization_id, ...fields.map(f => payload[f])];

    const query = `
      UPDATE business_profile
      SET ${setClause}, updated_at = now()
      WHERE organization_id = $1
      RETURNING *
    `;

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

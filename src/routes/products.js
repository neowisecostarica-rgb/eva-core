// src/routes/products.js

import express from "express";
import pool from "../db.js";
import { authenticate } from "../lib/auth.js";

const router = express.Router();

/*
====================================================
GET /v1/products
====================================================
*/

router.get("/", authenticate, async (req, res) => {
  try {
    const organization_id = req.organization_id;

    const result = await pool.query(
      `
      SELECT id, name, description, price, category, is_active, created_at
      FROM product_catalog
      WHERE organization_id = $1
      ORDER BY created_at DESC
      `,
      [organization_id]
    );

    res.json({ success: true, data: result.rows });

  } catch (err) {
    console.error("❌ GET products error:", err);
    res.status(500).json({ success: false });
  }
});


/*
====================================================
POST /v1/products
====================================================
*/

router.post("/", authenticate, async (req, res) => {
  try {
    const organization_id = req.organization_id;

    const {
      name,
      description,
      price,
      category,
      is_active = true
    } = req.body;

    const result = await pool.query(
      `
      INSERT INTO product_catalog
      (id, organization_id, name, description, price, category, is_active, created_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
      `,
      [organization_id, name, description, price, category, is_active]
    );

    res.json({ success: true, data: result.rows[0] });

  } catch (err) {
    console.error("❌ POST product error:", err);
    res.status(500).json({ success: false });
  }
});


/*
====================================================
PATCH /v1/products/:id
====================================================
*/

router.patch("/:id", authenticate, async (req, res) => {
  try {
    const organization_id = req.organization_id;
    const { id } = req.params;

    const fields = [];
    const values = [];
    let index = 1;

    for (const key in req.body) {
      fields.push(`${key} = $${index}`);
      values.push(req.body[key]);
      index++;
    }

    values.push(id);
    values.push(organization_id);

    const result = await pool.query(
      `
      UPDATE product_catalog
      SET ${fields.join(", ")}, updated_at = NOW()
      WHERE id = $${index} AND organization_id = $${index + 1}
      RETURNING *
      `,
      values
    );

    res.json({ success: true, data: result.rows[0] });

  } catch (err) {
    console.error("❌ PATCH product error:", err);
    res.status(500).json({ success: false });
  }
});

export default router;

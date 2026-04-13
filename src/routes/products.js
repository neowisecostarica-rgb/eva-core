// src/routes/products.js

import express from "express";
import pool from "../db.js";
import { authenticate } from "../lib/auth.js";

const router = express.Router();

/*
====================================================
ALLOWED FIELDS (CRÍTICO)
====================================================
*/

const ALLOWED_FIELDS = [
  "name",
  "description",
  "price",
  "category",
  "is_active",
];

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

    // 🔥 VALIDACIÓN MÍNIMA
    if (!name || typeof name !== "string") {
      return res.status(400).json({
        success: false,
        error: "name is required",
      });
    }

    if (price === undefined || price === null || isNaN(Number(price))) {
      return res.status(400).json({
        success: false,
        error: "price must be a valid number",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO product_catalog
      (id, organization_id, name, description, price, category, is_active, created_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
      `,
      [
        organization_id,
        name,
        description || null,
        Number(price),
        category || null,
        is_active,
      ]
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

    // 🔥 WHITELIST (CRÍTICO)
    for (const key of Object.keys(req.body)) {
      if (!ALLOWED_FIELDS.includes(key)) continue;

      fields.push(`${key} = $${index}`);

      if (key === "price") {
        values.push(Number(req.body[key]));
      } else {
        values.push(req.body[key]);
      }

      index++;
    }

    // 🔥 NO PERMITIR PATCH VACÍO
    if (!fields.length) {
      return res.status(400).json({
        success: false,
        error: "no valid fields to update",
      });
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

    // 🔥 NOT FOUND
    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        error: "product not found",
      });
    }

    res.json({ success: true, data: result.rows[0] });

  } catch (err) {
    console.error("❌ PATCH product error:", err);
    res.status(500).json({ success: false });
  }
});

export default router;

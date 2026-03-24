// src/routes/messages.js

import express from "express";
import pool from "../db.js";
import { authenticate } from "../lib/auth.js";
import { validateInbound } from "../validators.js";
import { handleInbound } from "../salesBrain.js";

const router = express.Router();

/*
========================================
POST /v1/messages/inbound
========================================
*/

router.post("/inbound", authenticate, async (req, res) => {
  try {
    console.log("📩 RAW REQUEST:", req.body);

    /*
    ========================================
    🔒 AUTH — SOURCE OF TRUTH
    ========================================
    */

    if (!req.organization || !req.organization.id) {
      console.error("❌ AUTH ERROR: organization missing in request");
      return res.status(401).json({
        error: "Unauthorized - organization not resolved",
      });
    }

    const organization_id = req.organization.id;

    /*
    ========================================
    🔒 SANITIZE INPUT
    ========================================
    */

    const safeInput = {
      phone: req.body.phone,
      text: (req.body.text || "").trim(),
      channel: (req.body.channel || "whatsapp").toLowerCase().trim(),
      message_id: req.body.message_id || null,
    };

    /*
    ========================================
    🛡️ GUARDRAIL BÁSICO
    ========================================
    */

    if (!safeInput.phone || !safeInput.text) {
      return res.status(400).json({
        error: "Missing required fields",
      });
    }

    /*
    ========================================
    VALIDACIÓN
    ========================================
    */

    const { valid, errors } = validateInbound(safeInput);

    if (!valid) {
      return res.status(400).json({
        error: "Payload inválido",
        details: errors,
      });
    }

    /*
    ========================================
    PAYLOAD FINAL (SOT)
    ========================================
    */

    const payload = {
      organization_id,
      ...safeInput,
    };

    console.log("🧠 EVA inbound:", payload);

    /*
    ========================================
    🧠 IDEMPOTENCIA INBOUND (P1.4)
    ========================================
    */

    if (payload.message_id) {
      try {
        const existing = await pool.query(
          `
          SELECT id
          FROM messages
          WHERE organization_id = $1
          AND external_message_id = $2
          LIMIT 1
          `,
          [organization_id, payload.message_id]
        );

        if (existing.rows.length > 0) {
          console.log("⚠️ Duplicate message detected, skipping:", payload.message_id);

          return res.json({
            success: true,
            duplicate: true,
          });
        }

      } catch (err) {
        console.error("❌ Idempotency check error:", err);
        // no bloqueamos flujo
      }
    }

    /*
    ========================================
    🚀 EJECUCIÓN CORE
    ========================================
    */

    const result = await handleInbound(payload);

    console.log("📦 RESPONSE:", result);

    return res.json({
      success: true,
      ...result,
    });

  } catch (err) {
    console.error("❌ ERROR /inbound:", err);

    return res.status(500).json({
      error: "Error procesando mensaje",
    });
  }
});

export default router;

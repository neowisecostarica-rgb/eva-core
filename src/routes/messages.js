// src/routes/messages.js

import express from "express";
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

    // 🔒 organization_id viene de auth (SOURCE OF TRUTH)
    if (!req.organization || !req.organization.id) {
      console.error("❌ AUTH ERROR: organization missing in request");
      return res.status(401).json({
        error: "Unauthorized - organization not resolved",
      });
    }

    const organization_id = req.organization.id;

    /*
    ========================================
    🔒 SANITIZE INPUT (NO confiar en req.body)
    ========================================
    */

    const safeInput = {
      phone: req.body.phone,
      text: req.body.text,
      channel: req.body.channel,
      message_id: req.body.message_id || null,
    };

    /*
    ========================================
    VALIDACIÓN SOLO DEL INPUT CONTROLADO
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
    PAYLOAD FINAL (SOURCE OF TRUTH)
    ========================================
    */

    const payload = {
      organization_id,
      ...safeInput,
    };

    console.log("🧠 EVA inbound:", payload);

    // 👉 Llamada al cerebro
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

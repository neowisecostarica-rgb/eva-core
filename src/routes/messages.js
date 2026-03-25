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

    /*
    ========================================
    🔒 AUTH (SOURCE OF TRUTH)
    ========================================
    */

    if (!req.organization || !req.organization.id) {
      console.error("❌ AUTH ERROR: organization missing");

      return res.status(401).json({
        error: "Unauthorized - organization not resolved",
      });
    }

    const organization_id = req.organization.id;

    /*
    ========================================
    ✅ VALIDATION (CONTRACT)
    ========================================
    */

    const validated = validateInbound(req.body);

    if (validated.error) {
      console.warn("⚠️ INVALID INPUT:", validated.message);

      return res.status(400).json({
        error: validated.message,
      });
    }

    /*
    ========================================
    🧠 FINAL PAYLOAD (CLEAN)
    ========================================
    */

    const payload = {
      organization_id,
      ...validated,
    };

    console.log("🧼 CLEAN PAYLOAD:", payload);

    /*
    ========================================
    🧠 EVA CORE
    ========================================
    */

    const result = await handleInbound(payload);

    /*
    ========================================
    ✅ RESPONSE
    ========================================
    */

    return res.json({
      success: true,
      data: result,
    });

  } catch (err) {
    console.error("❌ INBOUND ERROR:", err);

    return res.status(500).json({
      error: "Internal server error",
    });
  }
});

export default router;

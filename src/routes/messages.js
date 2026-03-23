import express from "express";
import { validateInbound } from "../validators.js";
import { handleInboundMessage } from "../salesBrain.js";
import { authenticate } from "../lib/auth.js";

const router = express.Router();

/*
====================================================
INBOUND (SECURE VERSION - P0.2 FIX)
====================================================
*/

router.post("/inbound", authenticate, async (req, res) => {
  try {
    console.log("📩 RAW REQUEST:", req.body);

    const validation = validateInbound(req.body);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    // ⚠️ CRÍTICO: NO confiar en organization_id del cliente
    const payload = {
      ...validation.data,
      organization_id: req.organization.id // ← viene del API KEY
    };

    const result = await handleInboundMessage(payload);

    const response = {
      success: true,
      reply: {
        text: result.reply,
        media: result.media || []
      },
      meta: {
        organization_id: payload.organization_id,
        channel: payload.channel,
        message_id: payload.message_id
      }
    };

    console.log("📦 RESPONSE:", response);

    return res.json(response);

  } catch (error) {
    console.error("❌ INBOUND ERROR:", error);

    return res.status(500).json({
      success: false,
      error: "internal_error"
    });
  }
});

export default router;

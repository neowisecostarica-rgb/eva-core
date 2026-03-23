import express from "express";
import { validateInbound } from "../validators.js";
import { handleInboundMessage } from "../salesBrain.js";
import { authenticate } from "../lib/auth.js";

const router = express.Router();

/*
====================================================
INBOUND (SECURE VERSION - P0.2 FIX HARDENED)
====================================================
*/

router.post("/inbound", authenticate, async (req, res) => {
  try {
    // 🔒 Guardrail crítico post-auth
    if (!req.organization || !req.organization.id) {
      console.error("❌ AUTH FAILED: organization missing");
      return res.status(401).json({
        success: false,
        error: "unauthorized"
      });
    }

    console.log("📩 Incoming:", {
      phone: req.body?.phone,
      text: req.body?.text,
      channel: req.body?.channel
    });

    const validation = validateInbound(req.body);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    // 🔒 Nunca confiar en organization_id del cliente
    const payload = {
      phone: validation.data.phone,
      text: validation.data.text,
      channel: validation.data.channel,
      message_id: validation.data.message_id || null,
      organization_id: req.organization.id
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

    console.log("📦 RESPONSE:", {
      ok: true,
      org: payload.organization_id,
      text_length: result.reply?.length || 0
    });

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

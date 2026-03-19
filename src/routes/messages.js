/*
====================================================
EVA MESSAGES API (CONTRACT FIXED)
====================================================
*/

import express from "express";
import { handleInbound } from "../salesBrain.js";
import pool from "../db.js";
import { validateInbound } from "../validators.js";

/*
AUTH
*/
import {
  authenticateApiKey,
  requireOrganizationMatch,
  allowLabOrganizationFallback
} from "../lib/auth.js";

/*
SECURITY
*/
import {
  inboundApiRateLimit,
  basicSecurityHeaders,
  blockOversizedText,
  requireJsonContent
} from "../lib/security.js";

const router = express.Router();

/*
====================================================
GLOBAL MIDDLEWARE
====================================================
*/

router.use(basicSecurityHeaders);
router.use(requireJsonContent);

router.use(authenticateApiKey);
router.use(requireOrganizationMatch);
router.use(allowLabOrganizationFallback);

router.use(inboundApiRateLimit);
router.use(blockOversizedText());

/*
====================================================
POST /v1/messages/inbound
====================================================
*/

router.post("/", async (req, res) => {
  try {
    const validated = validateInbound(req.body);

    if (!validated?.valid) {
      return res.status(400).json({
        success: false,
        error: validated?.error || "invalid_payload"
      });
    }

    const { phone, message, channel, message_id } = validated.data;
    const text = message;
    const conversation_id = req.body?.conversation_id || null;
    const organization_id = req.organization_id;

    console.log("📩 INBOUND REQUEST:", {
      organization_id,
      phone,
      text,
      channel,
      message_id
    });

    /*
    ====================================================
    CANCELAR FOLLOWUPS ACTIVOS
    ====================================================
    */

    try {
      await pool.query(
        `
        UPDATE followups
        SET status = 'CANCELLED',
            updated_at = NOW()
        WHERE organization_id = $1
        AND lead_phone = $2
        AND status = 'PENDING'
        `,
        [organization_id, phone]
      );
    } catch (err) {
      console.warn("⚠️ cancel followups error:", err.message);
    }

    /*
    ====================================================
    CORE
    ====================================================
    */

    const result = await handleInbound({
      organization_id,
      phone,
      text,
      conversation_id
    });

    console.log("🧠 RAW RESULT FROM BRAIN:", result);

    /*
    ====================================================
    CONTRACT NORMALIZATION
    Webhook espera:
    reply.text
    reply.media
    ====================================================
    */

    const safeReplyText =
      typeof result?.reply === "string" && result.reply.trim()
        ? result.reply.trim()
        : "Sin respuesta";

    const safeReplyMedia = Array.isArray(result?.media) ? result.media : [];

    return res.json({
      success: true,
      reply: {
        text: safeReplyText,
        media: safeReplyMedia
      },
      meta: {
        organization_id,
        channel,
        message_id
      }
    });
  } catch (err) {
    console.error("❌ messages API error:", err);

    return res.status(500).json({
      success: false,
      reply: {
        text: "Error interno en el servidor",
        media: []
      }
    });
  }
});

export default router;

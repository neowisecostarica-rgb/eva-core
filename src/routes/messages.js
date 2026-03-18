/*
====================================================
EVA MESSAGES API (FOLLOWUP ENABLED)
====================================================
*/

import express from "express";
import { handleInbound } from "../salesBrain.js";
import pool from "../db.js";

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

    const { phone, text, conversation_id } = req.body;

    if (!text || typeof text !== "string") {
      return res.status(400).json({
        success: false,
        error: "text_required"
      });
    }

    const organization_id = req.organization_id;
    const userPhone = phone || "unknown";

    /*
    ====================================================
    🔥 CANCELAR FOLLOWUPS ACTIVOS
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
        [organization_id, userPhone]
      );
    } catch (err) {
      console.warn("⚠️ cancel followups error", err.message);
    }

    /*
    ====================================================
    CORE
    ====================================================
    */

    const result = await handleInbound({
      organization_id,
      phone: userPhone,
      text,
      conversation_id
    });

    return res.json({
      success: true,
      reply: result.reply,
      meta: {
        organization_id
      }
    });

  } catch (err) {

    console.error("❌ messages API error:", err.message);

    return res.status(500).json({
      success: false,
      error: "internal_error"
    });
  }
});

export default router;

/*
====================================================
EVA MESSAGES API (FULL HARDENED VERSION)
====================================================
*/

import express from "express";
import { handleInbound } from "../salesBrain.js";

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
GLOBAL MIDDLEWARE STACK (ORDEN CRÍTICO)
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

    const { phone, text } = req.body;

    /*
    ====================================================
    VALIDACIÓN
    ====================================================
    */

    if (!text || typeof text !== "string") {
      return res.status(400).json({
        success: false,
        error: "text_required"
      });
    }

    const organization_id = req.organization_id;

    if (!organization_id) {
      return res.status(400).json({
        success: false,
        error: "organization_not_resolved"
      });
    }

    const userPhone = phone || "unknown";

    /*
    ====================================================
    LOG CONTROLADO
    ====================================================
    */

    console.log("📩 inbound (secure):", {
      org: organization_id,
      phone: userPhone,
      text_length: text.length,
      api_key: req.auth?.api_key_name
    });

    /*
    ====================================================
    CORE EXECUTION
    ====================================================
    */

    const result = await handleInbound({
      organization_id,
      phone: userPhone,
      text
    });

    /*
    ====================================================
    RESPONSE
    ====================================================
    */

    return res.json({
      success: true,
      reply: result.reply,
      meta: {
        ...result.meta,
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

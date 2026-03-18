/*
====================================================
EVA MESSAGES API (SECURE MULTI-TENANT)
====================================================
*/

import express from "express";
import { handleInbound } from "../salesBrain.js";
import {
  authenticateApiKey,
  requireOrganizationMatch,
  allowLabOrganizationFallback
} from "../lib/auth.js";

const router = express.Router();

/*
====================================================
MIDDLEWARE STACK (ORDEN IMPORTANTE)
====================================================
*/

router.use(authenticateApiKey);
router.use(requireOrganizationMatch);
router.use(allowLabOrganizationFallback);

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
    VALIDACIÓN MÍNIMA
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

    console.log("🔐 API inbound (secure):", {
      organization_id,
      phone: userPhone,
      text,
      api_key: req.auth?.api_key_name
    });

    /*
    ====================================================
    CORE
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

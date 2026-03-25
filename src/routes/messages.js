// src/routes/messages.js

import express from "express";
import crypto from "crypto";

import { authenticate } from "../lib/auth.js";
import { validateInbound } from "../validators.js";
import { handleInbound } from "../salesBrain.js";
import { createLogger } from "../lib/logger.js";

const router = express.Router();

/*
========================================
POST /v1/messages/inbound
========================================
*/

router.post("/inbound", authenticate, async (req, res) => {
  const request_id = crypto.randomUUID();

  /*
  ========================================
  LOGGER INIT (ANTES DE TODO)
  ========================================
  */

  const organization_id = req.organization?.id || null;

  const log = createLogger({
    request_id,
    organization_id,
  });

  try {
    log.info("INBOUND_REQUEST_RECEIVED", {
      raw: req.body,
    });

    /*
    ========================================
    AUTH (SOURCE OF TRUTH)
    ========================================
    */

    if (!organization_id) {
      log.error("AUTH_FAILED");

      return res.status(401).json({
        error: "Unauthorized - organization not resolved",
      });
    }

    /*
    ========================================
    VALIDATION (CONTRACT)
    ========================================
    */

    const validated = validateInbound(req.body);

    if (validated.error) {
      log.warn("INVALID_INPUT", {
        reason: validated.message,
      });

      return res.status(400).json({
        error: validated.message,
      });
    }

    /*
    ========================================
    PAYLOAD CLEAN
    ========================================
    */

    const payload = {
      organization_id,
      ...validated,
    };

    log.info("PAYLOAD_READY", payload);

    /*
    ========================================
    EVA CORE
    ========================================
    */

    const result = await handleInbound(payload);

    log.info("BRAIN_RESPONSE", {
      preview: result?.reply?.text?.slice(0, 100) || null,
    });

    /*
    ========================================
    RESPONSE
    ========================================
    */

    return res.json({
      success: true,
      data: result,
    });

  } catch (err) {
    log.error("INBOUND_ERROR", {
      message: err.message,
      stack: err.stack,
    });

    return res.status(500).json({
      error: "Internal server error",
    });
  }
});

export default router;

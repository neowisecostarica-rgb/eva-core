// src/routes/messages.js

import express from "express";
import crypto from "crypto";

import { authenticate } from "../lib/auth.js";
import { validateInbound } from "../validators.js";
import { handleInbound } from "../salesBrain.js";
import { createLogger } from "../lib/logger.js";
import { checkRateLimit } from "../lib/rateLimiter.js";

// 🔥 NUEVO: contrato runtime
import {
  validateHandleInboundResult,
  buildMessagesRouteResponse,
} from "../system/contracts/runtimeContract.js";

const router = express.Router();

/*
========================================
POST /v1/messages/inbound
========================================
*/

router.post("/inbound", authenticate, async (req, res) => {
  const request_id = crypto.randomUUID();

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
    AUTH
    ========================================
    */

    if (!organization_id) {
      log.error("AUTH_FAILED");

      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    /*
    ========================================
    VALIDATION
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
    🔒 RATE LIMIT
    ========================================
    */

    const rateKey = `${organization_id}:${validated.phone}`;
    const rate = checkRateLimit(rateKey);

    if (rate.blocked) {
      log.warn("RATE_LIMIT_BLOCKED", {
        phone: validated.phone,
      });

      return res.status(429).json({
        error: "Too many requests, try again later",
      });
    }

    /*
    ========================================
    PAYLOAD
    ========================================
    */

    const payload = {
      organization_id,
      ...validated,
    };

    log.info("PAYLOAD_READY", payload);

    /*
    ========================================
    BRAIN
    ========================================
    */

    const result = await handleInbound(payload);

    log.info("BRAIN_RESPONSE", {
      preview: result?.reply?.text?.slice(0, 100) || null,
    });

    /*
    ========================================
    🔥 CONTRACT VALIDATION (CLAVE)
    ========================================
    */

    try {
      validateHandleInboundResult(result);
    } catch (contractError) {
      log.error("CONTRACT_VIOLATION", {
        message: contractError.message,
        result,
      });

      return res.status(500).json({
        error: "Invalid brain response contract",
      });
    }

    /*
    ========================================
    🔥 BUILD OFFICIAL RESPONSE
    ========================================
    */

    const response = buildMessagesRouteResponse(result);

    return res.json(response);

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

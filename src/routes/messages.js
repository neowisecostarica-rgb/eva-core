import express from "express";
import crypto from "crypto";

import { buildContext } from "../contextBuilder.js";
import { authenticate } from "../lib/auth.js";
import { validateInbound } from "../validators.js";
import { handleInbound } from "../salesBrain.js";
import { createLogger } from "../lib/logger.js";
import { checkRateLimit } from "../lib/rateLimiter.js";

import {
  validateHandleInboundResult,
  buildMessagesRouteResponse,
} from "../system/contracts/runtimeContract.js";

const router = express.Router();

/*
========================================
POST /v1/messages/outbound
========================================
*/

router.post("/outbound", authenticate, async (req, res) => {
  const request_id = crypto.randomUUID();
  const organization_id = req.organization_id || req.organization?.id || null;

  const log = createLogger({
    request_id,
    organization_id,
  });

  try {
    log.info("OUTBOUND_REQUEST_RECEIVED", {
      raw: req.body,
    });

    if (!organization_id) {
      log.error("AUTH_FAILED");

      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    const { phone, text } = req.body || {};

    if (!phone || !text) {
      log.warn("INVALID_INPUT", {
        reason: "phone or text missing",
      });

      return res.status(400).json({
        error: "phone and text are required",
      });
    }

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: {
            body: text,
          },
        }),
      }
    );

    const data = await response.json();

    log.info("WHATSAPP_RESPONSE", data);

    if (!response.ok) {
      log.error("WHATSAPP_SEND_FAILED", data);

      return res.status(500).json({
        error: "WhatsApp send failed",
      });
    }

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    log.error("OUTBOUND_ERROR", {
      message: err.message,
      stack: err.stack,
    });

    return res.status(500).json({
      error: "Internal server error",
    });
  }
});

/*
========================================
POST /v1/messages/inbound
========================================
*/

router.post("/inbound", authenticate, async (req, res) => {
  const request_id = crypto.randomUUID();
  const organization_id = req.organization_id || req.organization?.id || null;

  const log = createLogger({
    request_id,
    organization_id,
  });

  try {
    log.info("INBOUND_REQUEST_RECEIVED", {
      raw: req.body,
    });

    if (!organization_id) {
      log.error("AUTH_FAILED");

      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    const validated = validateInbound(req.body);

    if (validated.error) {
      log.warn("INVALID_INPUT", {
        reason: validated.message,
      });

      return res.status(400).json({
        error: validated.message,
      });
    }

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

    const payload = {
      organization_id,
      phone: validated.phone,
      text: validated.text,
      channel: validated.channel || "whatsapp",
      message_id: validated.message_id || null,
    };

    const context = await buildContext({
  organization_id,
  phone: validated.phone,
});

log.info("CONTEXT_BUILT", {
  context_preview: {
    business_name: context?.organization?.business_name,
    assistant_name: context?.assistant?.name,
  },
});
    
    log.info("PAYLOAD_READY", payload);

    const result = await handleInbound(payload);

    log.info("BRAIN_RESPONSE", {
      preview: result?.reply?.text?.slice(0, 120) || null,
      meta: result?.meta || null,
    });

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

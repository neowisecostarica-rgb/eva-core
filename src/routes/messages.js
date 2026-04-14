import express from "express";
import crypto from "crypto";

import { buildContext } from "../contextBuilder.js";
import { authenticate } from "../lib/auth.js";
import { validateInbound } from "../validators.js";
import { handleInbound } from "../salesBrain.js";
import { createLogger } from "../lib/logger.js";
import { checkRateLimit } from "../lib/rateLimiter.js";
import db from "../db.js";

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
      log.warn("INVALID_INPUT");

      return res.status(400).json({
        error: "phone and text are required",
      });
    }

    // 🔥 EN VEZ DE ENVIAR DIRECTO → SE USA EL MISMO CIRCUITO
    await db.query(
      `
      INSERT INTO followups (
        organization_id,
        lead_phone,
        reason,
        due_at,
        status,
        created_at,
        updated_at
      )
      VALUES ($1,$2,'manual_outbound',NOW(),'PENDING',NOW(),NOW())
      `,
      [organization_id, phone]
    );

    return res.json({
      success: true,
      queued: true,
    });

  } catch (err) {
    log.error("OUTBOUND_ERROR", {
      message: err.message,
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
  const startTime = Date.now();

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

    /*
    ========================================
    RATE LIMIT
    ========================================
    */

    const rateKey = `${organization_id}:${validated.phone}`;
    const rate = checkRateLimit(rateKey);

    if (rate.blocked) {
      log.warn("RATE_LIMIT_BLOCKED");

      return res.status(429).json({
        error: "Too many requests",
      });
    }

    /*
    ========================================
    PAYLOAD
    ========================================
    */

    const payload = {
      organization_id,
      phone: validated.phone,
      text: validated.text,
      channel: validated.channel || "whatsapp",
      message_id: validated.message_id || null,
    };

    /*
    ========================================
    IDEMPOTENCIA
    ========================================
    */

    if (payload.message_id) {
      const existing = await db.query(
        `SELECT id FROM messages WHERE external_message_id = $1 LIMIT 1`,
        [payload.message_id]
      );

      if (existing.rows.length > 0) {
        log.warn("DUPLICATE_MESSAGE", {
          message_id: payload.message_id,
        });

        return res.json({
          success: true,
          data: {
            reply: { text: "" },
            meta: { duplicate: true },
          },
        });
      }
    }

    /*
    ========================================
    CONTEXT
    ========================================
    */

    const context = await buildContext({
      organization_id,
      phone: validated.phone,
      text: validated.text,
    });

    log.info("CONTEXT_BUILT", {
      business: context?.organization?.business_name,
      assistant: context?.assistant?.name,
    });

    /*
    ========================================
    BRAIN
    ========================================
    */

    const result = await handleInbound({
      ...payload,
      context,
    });

    /*
    ========================================
    VALIDACIÓN CONTRATO
    ========================================
    */

    try {
      validateHandleInboundResult(result);
    } catch (contractError) {
      log.error("CONTRACT_ERROR", contractError.message);

      return res.status(500).json({
        error: "Invalid brain response",
      });
    }

    /*
    ========================================
    PERF
    ========================================
    */

    const totalTime = Date.now() - startTime;

    log.info("PERF_TOTAL", {
      ms: totalTime,
    });

    /*
    ========================================
    RESPONSE
    ========================================
    */

    return res.json(buildMessagesRouteResponse(result));

  } catch (err) {
    log.error("INBOUND_ERROR", {
      message: err.message,
    });

    return res.status(500).json({
      error: "Internal server error",
    });
  }
});

export default router;

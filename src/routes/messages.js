import express from "express";
import { handleInbound } from "../salesBrain.js";
import { authenticate } from "../lib/auth.js";
import { validateInbound } from "../validators.js";
import { securityGuard } from "../lib/security.js";
const router = express.Router();

router.post("/inbound", securityGuard, async (req, res) => {
  try {
    const validated = validateInbound({
      ...req.body,
      organization_id: req.organization.id
    });

    const result = await handleInbound({
      organization_id: req.organization.id,
      payload: {
        ...validated,
        channel: String(req.body?.channel || "whatsapp").trim().toLowerCase(),
        external_message_id: req.body?.external_message_id
          ? String(req.body.external_message_id).trim()
          : null,
        metadata:
          req.body?.metadata && typeof req.body.metadata === "object"
            ? req.body.metadata
            : null
      }
    });

    if (result?.error === "brain_error") {
      return res.status(500).json(result);
    }

    return res.json(result);
  } catch (err) {
    console.error("inbound error", err);

    return res.status(400).json({
      error: "bad_request",
      message: err.message || "invalid payload"
    });
  }
});

export default router;

import express from "express";
import { handleInbound } from "../salesBrain.js";
import { validateInbound } from "../validators.js";
import { securityGuard } from "../lib/security.js";

const router = express.Router();

/*
====================================================
POST /v1/messages/inbound
Main EVA message entrypoint
====================================================
*/

router.post("/inbound", securityGuard, async (req, res) => {

  try {

    /*
    ------------------------------------------------
    VALIDATE PAYLOAD
    ------------------------------------------------
    */

    const validated = validateInbound(req.body);

    if (!validated.valid) {
      return res.status(400).json({
        error: validated.error
      });
    }

    /*
    ------------------------------------------------
    RESOLVE ORGANIZATION
    ------------------------------------------------
    */

    const organization_id =
      req.body?.organization_id ||
      req.headers["x-organization-id"] ||
      null;

    if (!organization_id) {
      return res.status(400).json({
        error: "missing_organization_id"
      });
    }

    /*
    ------------------------------------------------
    HANDLE MESSAGE
    ------------------------------------------------
    */

    const result = await handleInbound({

      organization_id,

      payload: {
        ...validated.data,

        channel: String(req.body?.channel || "whatsapp")
          .trim()
          .toLowerCase(),

        external_message_id: req.body?.external_message_id
          ? String(req.body.external_message_id).trim()
          : null,

        metadata:
          req.body?.metadata && typeof req.body.metadata === "object"
            ? req.body.metadata
            : null

      }

    });

    /*
    ------------------------------------------------
    HANDLE BRAIN ERRORS
    ------------------------------------------------
    */

    if (result?.error === "brain_error") {
      return res.status(500).json(result);
    }

    return res.json(result);

  } catch (err) {

    console.error("INBOUND ERROR", err);

    return res.status(400).json({
      error: "bad_request",
      message: err.message || "invalid payload"
    });

  }

});

export default router;

import express from "express";
import { handleInboundMessage } from "../salesBrain.js";
import { getOrganizationFromApiKey } from "../lib/auth.js";
import { registerUsage } from "../usage.js";

const router = express.Router();

router.post("/inbound", async (req, res) => {

  try {

    const apiKey = req.headers["x-api-key"];

    if (!apiKey) {
      return res.status(401).json({
        error: "missing_api_key"
      });
    }

    const organizationId = await getOrganizationFromApiKey(apiKey);

    const payload = {
      organization_id: organizationId,
      phone: req.body.phone,
      message: req.body.message
    };

    const result = await handleInboundMessage(payload);

    await registerUsage(organizationId);

    res.json({
      ok: true,
      reply: result.reply,
      intent: result.intent
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: "server_error"
    });

  }

});

export default router;

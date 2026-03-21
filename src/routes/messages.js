import express from "express";
import { validateInbound } from "../validators.js";
import { handleInboundMessage } from "../salesBrain.js";

const router = express.Router();

router.post("/inbound", async (req, res) => {
  try {
    console.log("📩 INBOUND REQUEST:", req.body);

    const validation = validateInbound(req.body);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    const result = await handleInboundMessage(validation.data);

    const response = {
      success: true,
      reply: {
        text: result.reply,
        media: result.media || []
      },
      meta: {
        organization_id: validation.data.organization_id,
        channel: validation.data.channel,
        message_id: validation.data.message_id
      }
    };

    console.log("📦 EVA RAW RESPONSE:", response);

    return res.json(response);
  } catch (error) {
    console.error("❌ INBOUND ERROR:", error);
    return res.status(500).json({
      success: false,
      error: "internal_error"
    });
  }
});

export default router;

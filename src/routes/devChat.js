import express from "express";
import { handleInbound } from "../salesBrain.js";

const router = express.Router();

/*
DEV CHAT
Permite probar EVA sin WhatsApp
*/

router.post("/chat", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();

    if (!message) {
      return res.status(400).json({
        error: "message_required"
      });
    }

    // teléfono dinámico para evitar duplicados
    const phone = "dev_" + Date.now();

    const result = await handleInbound({
      organization_id: "db83e3f9-d971-4ed1-9b6d-82408fbd7c03",
      payload: {
        phone,
        message,
        channel: "dev",
        external_message_id: null,
        metadata: null
      }
    });

    return res.json(result);

  } catch (err) {
    console.error("dev chat error", err);

    return res.status(500).json({
      error: "brain_error",
      details: err.message
    });
  }
});

export default router;

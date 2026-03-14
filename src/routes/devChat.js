import express from "express";
import { handleInbound } from "../salesBrain.js";

const router = express.Router();

/*
DEV CHAT
Este endpoint permite hablar con EVA sin WhatsApp
solo para pruebas internas
*/

router.post("/chat", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();

    if (!message) {
      return res.status(400).json({
        error: "message_required"
      });
    }

    const result = await handleInbound({
      organization_id: "db83e3f9-d971-4ed1-9b6d-82408fbd7c03",
      payload: {
        phone: "50688888888",
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

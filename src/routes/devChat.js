import express from "express";
import { handleInbound } from "../salesBrain.js";

const router = express.Router();

/*
DEV CHAT
Simulador de conversaciones para entrenar EVA
*/

router.post("/chat", async (req, res) => {
  try {

    const { message } = req.body;

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
        channel: "dev"
      }
    });

    return res.json(result);

  } catch (err) {
    console.error("dev chat error", err);

    return res.status(500).json({
      error: "dev_chat_failed"
    });
  }
});

export default router;

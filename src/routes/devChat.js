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
      organization_id: "00000000-0000-0000-0000-000000000000",
      payload: {
        phone: "dev-user",
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

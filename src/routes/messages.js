import express from "express";
import { handleInboundMessage } from "../salesBrain.js";
import { validateInbound } from "../validators.js";

const router = express.Router();

/*
====================================================
INBOUND (OFICIAL)
====================================================
*/

router.post("/inbound", async (req, res) => {
  try {
    const payload = validateInbound(req.body);

    const result = await handleInboundMessage(payload);

    return res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error("❌ INBOUND ERROR:", error.message);

    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/*
====================================================
COMPATIBILIDAD (ZIP 19)
====================================================
⚠️ NO BORRAR
Esto permite que lo anterior siga funcionando
*/

router.post("/", async (req, res) => {
  try {
    const payload = validateInbound(req.body);

    const result = await handleInboundMessage(payload);

    return res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error("❌ MESSAGE ERROR:", error.message);

    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

export default router;

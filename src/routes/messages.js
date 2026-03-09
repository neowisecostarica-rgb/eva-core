import express from "express";
import { handleInbound } from "../salesBrain.js";
import { authenticate } from "../lib/auth.js";

const router = express.Router();

router.post("/inbound", authenticate, async (req, res) => {

  try {

    const result = await handleInbound({
      organization_id: req.organization.id,
      payload: req.body
    });

    res.json(result);

  } catch (err) {

    console.error("inbound error", err);

    res.status(500).json({
      error: "server_error"
    });

  }

});

export default router;

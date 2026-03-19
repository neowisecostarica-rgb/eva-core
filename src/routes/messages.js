/*
====================================================
MESSAGES ROUTE (FIXED - CONTRACT SAFE)
====================================================
*/

import express from "express";
import { handleInbound } from "../salesBrain.js";
import { authenticate } from "../lib/auth.js";
import { validateInbound } from "../validators.js";

const router = express.Router();

/*
====================================================
POST /v1/messages/inbound
====================================================
*/

router.post("/inbound", authenticate, async (req, res) => {
  try {

    const organization_id = req.organization_id;

    /*
    ======================================
    VALIDATION
    ======================================
    */

    const { phone, text } = validateInbound(req.body);

    console.log("📩 INBOUND REQUEST:", { phone, text, organization_id });

    /*
    ======================================
    HANDLE INBOUND (BRAIN)
    ======================================
    */

    const result = await handleInbound({
      organization_id,
      phone,
      text
    });

    console.log("🧠 RAW RESULT FROM BRAIN:", result);

    /*
    ======================================
    CONTRACT NORMALIZATION (CLAVE)
    ======================================
    */

    const safeReply = result?.reply || "Sin respuesta";
    const safeMedia = Array.isArray(result?.media) ? result.media : [];

    /*
    ======================================
    RESPONSE FINAL (UNIFICADO)
    ======================================
    */

    return res.json({
      success: true,
      reply: {
        text: safeReply,
        media: safeMedia
      },
      meta: {
        organization_id
      }
    });

  } catch (err) {

    console.error("❌ MESSAGES ROUTE ERROR:", err);

    return res.status(500).json({
      success: false,
      reply: {
        text: "Error interno en el servidor",
        media: []
      }
    });
  }
});

export default router;

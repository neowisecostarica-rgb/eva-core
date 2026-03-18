/*
====================================================
EVA MESSAGES API (INBOUND STABLE)
====================================================
*/

import express from "express";
import { handleInbound } from "../salesBrain.js";

const router = express.Router();

/*
====================================================
POST /v1/messages/inbound
====================================================
*/

router.post("/", async (req, res) => {

  try {

    const {
      organization_id,
      phone,
      text
    } = req.body;

    /*
    ====================================================
    VALIDACIÓN MÍNIMA (NO BLOQUEANTE)
    ====================================================
    */

    if (!text || typeof text !== "string") {
      return res.status(400).json({
        error: "text is required"
      });
    }

    /*
    organization_id fallback (solo para laboratorio)
    */
    const orgId =
      organization_id ||
      req.headers["x-organization-id"] ||
      process.env.DEFAULT_ORGANIZATION_ID;

    if (!orgId) {
      return res.status(400).json({
        error: "organization_id is required"
      });
    }

    const userPhone = phone || "unknown";

    console.log("📩 API inbound:", {
      orgId,
      phone: userPhone,
      text
    });

    /*
    ====================================================
    CORE
    ====================================================
    */

    const result = await handleInbound({
      organization_id: orgId,
      phone: userPhone,
      text
    });

    /*
    ====================================================
    RESPONSE
    ====================================================
    */

    return res.json({
      success: true,
      reply: result.reply,
      meta: result.meta
    });

  } catch (err) {

    console.error("❌ messages API error:", err.message);

    return res.status(500).json({
      success: false,
      error: "internal_error"
    });
  }
});

export default router;

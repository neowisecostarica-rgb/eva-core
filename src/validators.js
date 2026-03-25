/*
====================================================
EVA VALIDATORS — INPUT CONTRACT (P1.4)
====================================================
*/

export function validateInbound(body = {}) {
  try {
    /*
    ========================================
    EXTRACT
    ========================================
    */

    let {
      phone,
      text,
      channel,
      message_id
    } = body;

    /*
    ========================================
    PHONE (REQUIRED)
    ========================================
    */

    if (!phone || typeof phone !== "string") {
      throw new Error("Invalid phone");
    }

    phone = phone.replace(/\D/g, "");

    if (phone.length < 8) {
      throw new Error("Invalid phone format");
    }

    /*
    ========================================
    TEXT (REQUIRED)
    ========================================
    */

    if (!text || typeof text !== "string") {
      throw new Error("Invalid text");
    }

    text = text.trim();

    if (text.length === 0) {
      throw new Error("Empty text");
    }

    if (text.length > 1000) {
      text = text.slice(0, 1000);
    }

    /*
    ========================================
    CHANNEL (DEFAULT)
    ========================================
    */

    const allowedChannels = ["whatsapp", "web", "instagram"];

    if (!channel || !allowedChannels.includes(channel)) {
      channel = "whatsapp";
    }

    /*
    ========================================
    MESSAGE ID (OPTIONAL)
    ========================================
    */

    if (message_id && typeof message_id !== "string") {
      message_id = null;
    }

    if (message_id && message_id.length > 120) {
      message_id = message_id.slice(0, 120);
    }

    /*
    ========================================
    OUTPUT CLEAN
    ========================================
    */

    return {
      phone,
      text,
      channel,
      message_id: message_id || null
    };

  } catch (err) {
    return {
      error: true,
      message: err.message || "Invalid input"
    };
  }
}

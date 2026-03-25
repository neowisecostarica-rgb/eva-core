/*
====================================================
EVA VALIDATORS — INPUT CONTRACT (STABILIZATION v1)
====================================================
*/

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

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

    if (!isNonEmptyString(phone)) {
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

    if (!isNonEmptyString(text)) {
      throw new Error("Invalid text");
    }

    text = text.trim();

    if (text.length > 1000) {
      text = text.slice(0, 1000);
    }

    /*
    ========================================
    CHANNEL (CONTROLLED)
    ========================================
    */

    const allowedChannels = ["whatsapp", "web", "instagram"];

    if (!isNonEmptyString(channel) || !allowedChannels.includes(channel)) {
      channel = "whatsapp";
    }

    /*
    ========================================
    MESSAGE ID (OPTIONAL NORMALIZED)
    ========================================
    */

    if (!isNonEmptyString(message_id)) {
      message_id = null;
    }

    if (message_id && message_id.length > 120) {
      message_id = message_id.slice(0, 120);
    }

    /*
    ========================================
    OUTPUT (CONTRACT SAFE)
    ========================================
    */

    return {
      phone,
      text,
      channel,
      message_id
    };

  } catch (err) {
    return {
      error: true,
      message: err.message || "Invalid input"
    };
  }
}

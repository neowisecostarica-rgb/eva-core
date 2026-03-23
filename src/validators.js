/*
====================================================
EVA CORE - VALIDATORS (FIXED + FLEXIBLE)
====================================================
*/

export function validateInbound(payload = {}) {
  const {
    organization_id,
    phone,
    text,
    channel,
    message_id
  } = payload;

  // 📱 PHONE
  if (!phone || typeof phone !== "string") {
    return { valid: false, error: "missing_phone" };
  }

  // 💬 TEXT
  if (!text || typeof text !== "string") {
    return { valid: false, error: "missing_text" };
  }

  // 📡 CHANNEL (fallback seguro)
  const safeChannel =
    channel && typeof channel === "string"
      ? channel.trim()
      : "whatsapp";

  // 🏢 ORG (FLEXIBLE POR AHORA)
  const safeOrg =
    organization_id && typeof organization_id === "string"
      ? organization_id.trim()
      : "default-org";

  return {
    valid: true,
    data: {
      organization_id: safeOrg,
      phone: phone.trim(),
      text: text.trim(),
      channel: safeChannel,
      message_id: message_id ?? null
    }
  };
}

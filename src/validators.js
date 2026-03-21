/*
====================================================
EVA CORE - VALIDATORS
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

  if (!organization_id || typeof organization_id !== "string") {
    return { valid: false, error: "missing_organization_id" };
  }

  if (!phone || typeof phone !== "string") {
    return { valid: false, error: "missing_phone" };
  }

  if (!text || typeof text !== "string") {
    return { valid: false, error: "missing_text" };
  }

  if (!channel || typeof channel !== "string") {
    return { valid: false, error: "missing_channel" };
  }

  return {
    valid: true,
    data: {
      organization_id: organization_id.trim(),
      phone: phone.trim(),
      text: text.trim(),
      channel: channel.trim(),
      message_id: message_id ?? null
    }
  };
}

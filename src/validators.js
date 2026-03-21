/*
====================================================
VALIDATORS - EVA CORE (FIXED)
====================================================
*/

export function validateInbound(payload) {
  const { phone, text } = payload;

  // VALIDATE PHONE
  if (!phone || typeof phone !== "string") {
    return { valid: false, error: "missing_phone" };
  }

  // VALIDATE TEXT
  if (!text || typeof text !== "string") {
    return { valid: false, error: "missing_text" };
  }

  // CLEAN TEXT
  const cleanText = text.trim();

  return {
    valid: true,
    data: {
      phone,
      text: cleanText
    }
  };
}

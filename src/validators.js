// src/validators.js

export function validateInbound(body) {
  const errors = [];

  if (!body || typeof body !== "object") {
    return { valid: false, errors: ["Body requerido y debe ser objeto"] };
  }

  /*
  ========================================
  NORMALIZACIÓN (SOURCE OF TRUTH)
  ========================================
  */

  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const channel = typeof body.channel === "string"
    ? body.channel.trim().toLowerCase()
    : "whatsapp"; // default controlado aquí
  const message_id = body.message_id || null;

  /*
  ========================================
  VALIDACIONES
  ========================================
  */

  if (!phone) {
    errors.push("phone requerido");
  } else if (!/^\d{8,15}$/.test(phone)) {
    errors.push("phone inválido (solo números, 8–15 dígitos)");
  }

  if (!text) {
    errors.push("text requerido");
  } else if (text.length < 1) {
    errors.push("text inválido");
  }

  if (!channel) {
    errors.push("channel requerido");
  } else if (!["whatsapp", "web", "instagram"].includes(channel)) {
    errors.push("channel inválido");
  }

  /*
  ========================================
  RESULTADO
  ========================================
  */

  return {
    valid: errors.length === 0,
    errors,
    sanitized: {
      phone,
      text,
      channel,
      message_id,
    },
  };
}

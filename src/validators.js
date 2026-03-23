// src/validators.js

export function validateInbound(body) {
  const errors = [];

  if (!body) {
    return { valid: false, errors: ["Body requerido"] };
  }

  if (!body.phone) {
    errors.push("phone requerido");
  }

  if (!body.text) {
    errors.push("text requerido");
  }

  if (!body.channel) {
    errors.push("channel requerido");
  }

  // 🚨 IMPORTANTE: organization_id YA NO se valida aquí
  // viene desde auth (req.organization_id)

  return {
    valid: errors.length === 0,
    errors,
  };
}

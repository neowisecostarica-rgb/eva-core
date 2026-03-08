function isString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizePhone(phone) {
  return phone.replace(/\D/g, "");
}

export function validateInbound(body) {
  if (!body || typeof body !== "object") {
    throw new Error("invalid payload");
  }

  const { organization_id, phone, message } = body;

  if (!isString(organization_id)) {
    throw new Error("organization_id is required");
  }

  if (!isString(phone)) {
    throw new Error("phone is required");
  }

  if (!isString(message)) {
    throw new Error("message is required");
  }

  const normalizedPhone = normalizePhone(phone);

  if (normalizedPhone.length < 8) {
    throw new Error("invalid phone");
  }

  return {
    organization_id: organization_id.trim(),
    phone: normalizedPhone,
    message: message.trim()
  };
}

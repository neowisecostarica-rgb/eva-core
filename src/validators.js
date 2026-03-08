export function validateInbound(body) {
  const { organization_id, phone, message, channel } = body;

  if (!organization_id) throw new Error("organization_id required");
  if (!phone) throw new Error("phone required");
  if (!message) throw new Error("message required");

  return {
    organization_id,
    phone,
    message,
    channel: channel || "whatsapp"
  };
}

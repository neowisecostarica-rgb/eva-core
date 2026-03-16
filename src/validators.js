/*
====================================================
EVA VALIDATORS
Protección de entrada para endpoints públicos
====================================================

Este módulo valida los payloads entrantes
antes de que entren al SalesBrain.

Evita:

• payloads corruptos
• ataques simples
• mensajes inválidos
• errores de integración

Usado por:

POST /v1/messages/inbound

====================================================
*/

export function validateInbound(payload = {}) {

  if (!payload) {
    return { valid: false, error: "missing_payload" };
  }

  /*
  ----------------------------------------------------
  PHONE
  ----------------------------------------------------
  */

  const phone = String(payload.phone || payload.from || "")
    .replace(/\s+/g, "")
    .trim();

  if (!phone) {
    return { valid: false, error: "missing_phone" };
  }

  if (phone.length < 6) {
    return { valid: false, error: "invalid_phone" };
  }

  /*
  ----------------------------------------------------
  MESSAGE
  ----------------------------------------------------
  */

  const message = String(payload.message || payload.text || "")
    .trim();

  if (!message) {
    return { valid: false, error: "missing_message" };
  }

  if (message.length > 5000) {
    return { valid: false, error: "message_too_long" };
  }

  /*
  ----------------------------------------------------
  MESSAGE ID
  ----------------------------------------------------
  */

  const messageId =
    payload.message_id ||
    payload.external_message_id ||
    null;

  /*
  ----------------------------------------------------
  CHANNEL
  ----------------------------------------------------
  */

  const channel = String(payload.channel || "whatsapp")
    .toLowerCase()
    .trim();

  /*
  ----------------------------------------------------
  SAFE PAYLOAD
  ----------------------------------------------------
  */

  return {
    valid: true,
    data: {
      phone,
      message,
      message_id: messageId,
      channel
    }
  };

}

/*
====================================================
RUNTIME CONTRACT — EVA CORE
Single executable contract for live runtime layers
====================================================
*/

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalArray(value) {
  return value === undefined || Array.isArray(value);
}

function isOptionalObject(value) {
  return value === undefined || (value !== null && typeof value === "object" && !Array.isArray(value));
}

/* ======================================
   HANDLE INBOUND RESULT CONTRACT
   Source of truth for salesBrain output
====================================== */

export function isValidHandleInboundResult(result) {
  if (!result || typeof result !== "object") return false;
  if (!result.reply || typeof result.reply !== "object") return false;
  if (!isNonEmptyString(result.reply.text)) return false;
  if (!isOptionalArray(result.reply.products)) return false;
  if (!isOptionalArray(result.reply.media)) return false;
  if (!isOptionalObject(result.meta)) return false;

  return true;
}

export function validateHandleInboundResult(result) {
  if (!result || typeof result !== "object") {
    throw new Error("Invalid handleInbound result: result must be an object");
  }

  if (!result.reply || typeof result.reply !== "object") {
    throw new Error("Invalid handleInbound result: reply object is required");
  }

  if (!isNonEmptyString(result.reply.text)) {
    throw new Error("Invalid handleInbound result: reply.text must be a non-empty string");
  }

  if (!isOptionalArray(result.reply.products)) {
    throw new Error("Invalid handleInbound result: reply.products must be an array when present");
  }

  if (!isOptionalArray(result.reply.media)) {
    throw new Error("Invalid handleInbound result: reply.media must be an array when present");
  }

  if (!isOptionalObject(result.meta)) {
    throw new Error("Invalid handleInbound result: meta must be an object when present");
  }

  return true;
}

/* ======================================
   ROUTE RESPONSE CONTRACT
   Source of truth for /v1/messages/inbound
====================================== */

export function buildMessagesRouteResponse(result) {
  validateHandleInboundResult(result);

  return {
    success: true,
    data: {
      reply: {
        text: result.reply.text,
        products: Array.isArray(result.reply.products) ? result.reply.products : [],
        media: Array.isArray(result.reply.media) ? result.reply.media : []
      },
      meta: result.meta || {}
    }
  };
}

export function isValidMessagesRouteResponse(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (payload.success !== true) return false;
  if (!payload.data || typeof payload.data !== "object") return false;
  if (!payload.data.reply || typeof payload.data.reply !== "object") return false;
  if (!isNonEmptyString(payload.data.reply.text)) return false;
  if (!isOptionalArray(payload.data.reply.products)) return false;
  if (!isOptionalArray(payload.data.reply.media)) return false;
  if (!isOptionalObject(payload.data.meta)) return false;

  return true;
}

export function validateMessagesRouteResponse(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid messages route response: payload must be an object");
  }

  if (payload.success !== true) {
    throw new Error("Invalid messages route response: success must be true");
  }

  if (!payload.data || typeof payload.data !== "object") {
    throw new Error("Invalid messages route response: data object is required");
  }

  if (!payload.data.reply || typeof payload.data.reply !== "object") {
    throw new Error("Invalid messages route response: data.reply object is required");
  }

  if (!isNonEmptyString(payload.data.reply.text)) {
    throw new Error("Invalid messages route response: data.reply.text must be a non-empty string");
  }

  if (!isOptionalArray(payload.data.reply.products)) {
    throw new Error("Invalid messages route response: data.reply.products must be an array when present");
  }

  if (!isOptionalArray(payload.data.reply.media)) {
    throw new Error("Invalid messages route response: data.reply.media must be an array when present");
  }

  if (!isOptionalObject(payload.data.meta)) {
    throw new Error("Invalid messages route response: data.meta must be an object when present");
  }

  return true;
}

/* ======================================
   WEBHOOK CONSUMER HELPERS
====================================== */

export function extractReplyFromMessagesRouteResponse(payload) {
  validateMessagesRouteResponse(payload);

  return {
    text: payload.data.reply.text,
    products: Array.isArray(payload.data.reply.products) ? payload.data.reply.products : [],
    media: Array.isArray(payload.data.reply.media) ? payload.data.reply.media : [],
    meta: payload.data.meta || {}
  };
}

import { createHmac, timingSafeEqual } from "node:crypto";

// Verify the original raw bytes, never a reconstructed JSON object.
export function isValidMetaSignature(rawBody, signature, appSecret) {
  if (!Buffer.isBuffer(rawBody) || !appSecret ||
      typeof signature !== "string" || !/^sha256=[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const received = Buffer.from(signature.slice(7), "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function requireMetaSignature(req, res, next) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    return res.status(503).json({ error: "Webhook signature verification unavailable" });
  }
  if (!isValidMetaSignature(req.rawBody, req.get("x-hub-signature-256"), secret)) {
    return res.status(403).json({ error: "Invalid webhook signature" });
  }
  next();
}

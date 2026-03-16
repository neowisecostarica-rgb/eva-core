/*
====================================================
EVA SECURITY LAYER
API Protection & Rate Limiting
====================================================

Protecciones incluidas:

• Rate limit por teléfono
• Rate limit por IP
• Anti spam básico
• Anti flooding

Este módulo protege los endpoints públicos
como:

POST /v1/messages/inbound

====================================================
*/

const rateLimitMemory = new Map();

/*
====================================================
CONFIG
====================================================
*/

const WINDOW_MS = 60000; // 1 minuto
const MAX_REQUESTS_PER_PHONE = 20;
const MAX_REQUESTS_PER_IP = 60;

/*
====================================================
HELPERS
====================================================
*/

function now() {
  return Date.now();
}

function cleanupOldEntries() {

  const current = now();

  for (const [key, value] of rateLimitMemory.entries()) {

    if (current - value.start > WINDOW_MS) {
      rateLimitMemory.delete(key);
    }

  }

}

/*
====================================================
RATE LIMIT CHECK
====================================================
*/

function checkRateLimit(key, limit) {

  const current = now();

  const record = rateLimitMemory.get(key);

  if (!record) {

    rateLimitMemory.set(key, {
      count: 1,
      start: current
    });

    return true;

  }

  if (current - record.start > WINDOW_MS) {

    rateLimitMemory.set(key, {
      count: 1,
      start: current
    });

    return true;

  }

  if (record.count >= limit) {
    return false;
  }

  record.count++;

  return true;

}

/*
====================================================
MIDDLEWARE
====================================================
*/

export function securityGuard(req, res, next) {

  try {

    cleanupOldEntries();

    const ip =
      req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress ||
      "unknown";

    const phone =
      req.body?.phone ||
      req.body?.from ||
      "unknown";

    /*
    ------------------------------------------------
    RATE LIMIT PER IP
    ------------------------------------------------
    */

    const ipAllowed = checkRateLimit(
      `ip:${ip}`,
      MAX_REQUESTS_PER_IP
    );

    if (!ipAllowed) {

      return res.status(429).json({
        error: "rate_limit_ip"
      });

    }

    /*
    ------------------------------------------------
    RATE LIMIT PER PHONE
    ------------------------------------------------
    */

    const phoneAllowed = checkRateLimit(
      `phone:${phone}`,
      MAX_REQUESTS_PER_PHONE
    );

    if (!phoneAllowed) {

      return res.status(429).json({
        error: "rate_limit_phone"
      });

    }

    next();

  } catch (err) {

    console.error("SECURITY GUARD ERROR", err);

    next();

  }

}

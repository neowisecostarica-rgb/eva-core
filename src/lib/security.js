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

/*
====================================================
RATE LIMIT
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
     // MAX_REQUESTS_PER_PHONE
====================================================
EVA SECURITY LIB (RATE LIMIT + BASIC HARDENING)
====================================================
*/

const memoryStore = new Map();

/*
====================================================
HELPERS
====================================================
*/

function nowMs() {
  return Date.now();
}

function normalizeKey(value = "") {
  return String(value || "").trim().toLowerCase();
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded && typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }

  return (
    req.ip ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function getApiIdentity(req) {
  return (
    req.auth?.api_key_id ||
    req.auth?.api_key_name ||
    req.headers["x-api-key"] ||
    req.headers["x-eva-api-key"] ||
    "anonymous"
  );
}

function cleanupExpiredEntries() {
  const current = nowMs();

  for (const [key, value] of memoryStore.entries()) {
    if (!value || value.resetAt <= current) {
      memoryStore.delete(key);
    }
  }
}

function consumeLimit({ key, limit, windowMs }) {
  const current = nowMs();
  const existing = memoryStore.get(key);

  if (!existing || existing.resetAt <= current) {
    const fresh = {
      count: 1,
      resetAt: current + windowMs
    };

    memoryStore.set(key, fresh);

    return {
      allowed: true,
      remaining: Math.max(limit - 1, 0),
      resetAt: fresh.resetAt
    };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt
    };
  }

  existing.count += 1;
  memoryStore.set(key, existing);

  return {
    allowed: true,
    remaining: Math.max(limit - existing.count, 0),
    resetAt: existing.resetAt
  };
}

/*
====================================================
RATE LIMIT MIDDLEWARE FACTORY
====================================================
*/

function createRateLimiter({
  name = "default",
  limit = 60,
  windowMs = 60 * 1000,
  keyBuilder
} = {}) {
  return function rateLimitMiddleware(req, res, next) {
    try {
      cleanupExpiredEntries();

      const identity = normalizeKey(keyBuilder(req));
      const bucketKey = `${name}:${identity}`;

      const result = consumeLimit({
        key: bucketKey,
        limit,
        windowMs
      });

      res.setHeader("X-RateLimit-Limit", String(limit));
      res.setHeader("X-RateLimit-Remaining", String(result.remaining));
      res.setHeader("X-RateLimit-Reset", String(Math.floor(result.resetAt / 1000)));

      if (!result.allowed) {
        return res.status(429).json({
          success: false,
          error: "rate_limit_exceeded"
        });
      }

      return next();
    } catch (err) {
      console.error("❌ rate limit error:", err.message);
      return res.status(500).json({
        success: false,
        error: "rate_limit_error"
      });
    }
  };
}

/*
====================================================
PUBLIC LIMITERS
====================================================
*/

/*
Más estricto: escritura / mensajes
*/
export const inboundApiRateLimit = createRateLimiter({
  name: "inbound_api",
  limit: Number(process.env.EVA_RATE_LIMIT_INBOUND || 30),
  windowMs: Number(process.env.EVA_RATE_LIMIT_INBOUND_WINDOW_MS || 60 * 1000),
  keyBuilder: (req) => {
    const apiIdentity = getApiIdentity(req);
    const ip = getClientIp(req);
    return `${apiIdentity}:${ip}`;
  }
});

/*
Más relajado: lectura / métricas
*/
export const metricsApiRateLimit = createRateLimiter({
  name: "metrics_api",
  limit: Number(process.env.EVA_RATE_LIMIT_METRICS || 60),
  windowMs: Number(process.env.EVA_RATE_LIMIT_METRICS_WINDOW_MS || 60 * 1000),
  keyBuilder: (req) => {
    const apiIdentity = getApiIdentity(req);
    return `${apiIdentity}`;
  }
});

/*
Webhook público: limitar por IP
Ojo: no usar límites demasiado bajos porque Meta reintenta.
*/
export const webhookRateLimit = createRateLimiter({
  name: "whatsapp_webhook",
  limit: Number(process.env.EVA_RATE_LIMIT_WEBHOOK || 120),
  windowMs: Number(process.env.EVA_RATE_LIMIT_WEBHOOK_WINDOW_MS || 60 * 1000),
  keyBuilder: (req) => getClientIp(req)
});

/*
====================================================
BASIC REQUEST HARDENING
====================================================
*/

export function basicSecurityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  return next();
}

export function blockOversizedText({
  maxLength = Number(process.env.EVA_MAX_TEXT_LENGTH || 5000)
} = {}) {
  return function oversizedTextGuard(req, res, next) {
    const text = req.body?.text;

    if (typeof text === "string" && text.length > maxLength) {
      return res.status(413).json({
        success: false,
        error: "text_too_large"
      });
    }

    return next();
  };
}

export function requireJsonContent(req, res, next) {
  const method = String(req.method || "").toUpperCase();

  if (method === "POST" || method === "PATCH" || method === "PUT") {
    const contentType = req.headers["content-type"] || "";

    if (!contentType.includes("application/json")) {
      return res.status(415).json({
        success: false,
        error: "content_type_must_be_json"
      });
    }
  }

  return next();
}
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

/*
EVA SECURITY LIB (CLEAN VERSION)
*/

const memoryStore = new Map();

/*
HELPERS
*/

function nowMs() {
  return Date.now();
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return req.ip || "unknown";
}

function getApiIdentity(req) {
  return (
    req.auth?.api_key_id ||
    req.headers["x-api-key"] ||
    "anonymous"
  );
}

function cleanupExpiredEntries() {
  const now = nowMs();

  for (const [key, value] of memoryStore.entries()) {
    if (value.resetAt <= now) {
      memoryStore.delete(key);
    }
  }
}

function consumeLimit({ key, limit, windowMs }) {
  const now = nowMs();
  const existing = memoryStore.get(key);

  if (!existing || existing.resetAt <= now) {
    memoryStore.set(key, {
      count: 1,
      resetAt: now + windowMs
    });

    return { allowed: true };
  }

  if (existing.count >= limit) {
    return { allowed: false };
  }

  existing.count += 1;
  memoryStore.set(key, existing);

  return { allowed: true };
}

/*
RATE LIMIT
*/

function createRateLimiter({ limit, windowMs, keyBuilder }) {
  return function (req, res, next) {
    cleanupExpiredEntries();

    const key = keyBuilder(req);

    const result = consumeLimit({
      key,
      limit,
      windowMs
    });

    if (!result.allowed) {
      return res.status(429).json({
        success: false,
        error: "rate_limit_exceeded"
      });
    }

    next();
  };
}

/*
EXPORTS
*/

export const inboundApiRateLimit = createRateLimiter({
  limit: 30,
  windowMs: 60000,
  keyBuilder: (req) =>
    `${getApiIdentity(req)}:${getClientIp(req)}`
});

export const metricsApiRateLimit = createRateLimiter({
  limit: 60,
  windowMs: 60000,
  keyBuilder: (req) => getApiIdentity(req)
});

export const webhookRateLimit = createRateLimiter({
  limit: 120,
  windowMs: 60000,
  keyBuilder: (req) => getClientIp(req)
});

/*
HEADERS
*/

export function basicSecurityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  next();
}

/*
VALIDATIONS
*/

export function requireJsonContent(req, res, next) {
  const type = req.headers["content-type"] || "";

  if (!type.includes("application/json")) {
    return res.status(415).json({
      success: false,
      error: "json_required"
    });
  }

  next();
}

export function blockOversizedText(max = 5000) {
  return function (req, res, next) {
    const text = req.body?.text;

    if (text && text.length > max) {
      return res.status(413).json({
        success: false,
        error: "text_too_large"
      });
    }

    next();
  };
}

/*
====================================================
EVA RATE LIMITER — SIMPLE MEMORY (P1.6)
====================================================
*/

const buckets = new Map();

/*
========================================
CONFIG
========================================
*/

const WINDOW_MS = 10 * 1000; // 10 segundos
const MAX_REQUESTS = 5;

/*
========================================
CHECK
========================================
*/

export function checkRateLimit(key) {
  const now = Date.now();

  if (!buckets.has(key)) {
    buckets.set(key, []);
  }

  const timestamps = buckets.get(key);

  // limpiar ventana
  const filtered = timestamps.filter(t => now - t < WINDOW_MS);

  filtered.push(now);
  buckets.set(key, filtered);

  if (filtered.length > MAX_REQUESTS) {
    return {
      blocked: true,
      retryAfter: WINDOW_MS
    };
  }

  return { blocked: false };
}

/*
====================================================
EVA LOGGER — STRUCTURED LOGS (P1.5)
====================================================
*/

export function createLogger({ request_id, organization_id }) {
  function base(level, message, data = {}) {
    const log = {
      level,
      message,
      request_id,
      organization_id,
      timestamp: new Date().toISOString(),
      ...data,
    };

    console.log(JSON.stringify(log));
  }

  return {
    info: (message, data) => base("info", message, data),
    warn: (message, data) => base("warn", message, data),
    error: (message, data) => base("error", message, data),
  };
}

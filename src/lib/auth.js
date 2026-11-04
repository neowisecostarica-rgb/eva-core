import { timingSafeEqual } from "node:crypto";

// Reuse the existing single-organization identity, fail-closed.
// This is not multi-tenant RBAC; it prevents silent organization header mismatches.
export function verifyServiceIdentity({ providedKey, configuredKey, expectedOrg, requestedOrg }) {
  if (typeof configuredKey !== "string" || !configuredKey ||
      typeof expectedOrg !== "string" || !expectedOrg) {
    return { ok: false, status: 503, error: "Service identity not configured" };
  }
  if (typeof providedKey !== "string" || !providedKey) {
    return { ok: false, status: 401, error: "API key required" };
  }
  const supplied = Buffer.from(providedKey);
  const configured = Buffer.from(configuredKey);
  if (supplied.length !== configured.length || !timingSafeEqual(supplied, configured)) {
    return { ok: false, status: 403, error: "Invalid API key" };
  }
  if (requestedOrg != null &&
      (typeof requestedOrg !== "string" || requestedOrg !== expectedOrg)) {
    return { ok: false, status: 403, error: "Organization not authorized" };
  }
  return { ok: true, organization_id: expectedOrg };
}

export async function authenticate(req, res, next) {
  try {
    const raw = req.headers["x-api-key"] ?? req.headers.authorization ?? "";
    const key = typeof raw === "string" && /^Bearer /i.test(raw)
      ? raw.slice(7).trim() : raw;
    const result = verifyServiceIdentity({
      providedKey: key,
      configuredKey: process.env.EVA_API_KEY,
      expectedOrg: process.env.ORG_PRIMARY,
      requestedOrg: req.headers["x-eva-org-id"],
    });
    if (!result.ok) {
      return res.status(result.status).json({ success: false, error: result.error });
    }
    req.organization = { id: result.organization_id };
    req.organization_id = result.organization_id;
    next();
  } catch (error) {
    console.error("EVA authentication failure", error?.name);
    return res.status(500).json({ success: false, error: "Authentication failure" });
  }
}

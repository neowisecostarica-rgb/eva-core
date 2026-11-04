// Reuse the existing business_profile columns already handled by /v1/setup/business-profile.
// No arbitrary SQL identifiers from request bodies.
const ALLOWED_FIELDS = new Set(["business_name", "sinpe_number", "bank_name", "delivery_available"]);

export function buildBusinessProfileUpdate(payload, organizationId) {
  if (typeof organizationId !== "string" || !organizationId.trim()) {
    return { ok: false, error: "Organization missing" };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "Expected JSON object" };
  }
  const fields = Object.keys(payload);
  if (!fields.length || fields.some(field => !ALLOWED_FIELDS.has(field))) {
    return { ok: false, error: "Invalid business profile fields" };
  }
  if (fields.includes("delivery_available") && typeof payload.delivery_available !== "boolean") {
    return { ok: false, error: "delivery_available must be boolean" };
  }
  if (fields.some(field => field !== "delivery_available" &&
      payload[field] !== null && typeof payload[field] !== "string")) {
    return { ok: false, error: "Invalid business profile value" };
  }
  const assignments = fields.map((field, i) => `${field} = $${i + 2}`).join(", ");
  return {
    ok: true,
    query: `UPDATE business_profile SET ${assignments}, updated_at = NOW() WHERE organization_id = $1 RETURNING *`,
    values: [organizationId, ...fields.map(field => payload[field])],
  };
}

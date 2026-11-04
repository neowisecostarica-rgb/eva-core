// EVA-MB-003A — pure authorization policy, deliberately decoupled from storage.
// A caller MUST obtain the principal from a verified server-side identity.
// Never use organization_id or role taken directly from a browser request.
export const TENANT_ROLES = Object.freeze([
  "SUPER_ADMIN", "ORG_ADMIN", "SALES_MANAGER", "SALES_AGENT", "VIEWER"
]);

const permissions = Object.freeze({
  "leads:read": ["ORG_ADMIN", "SALES_MANAGER", "SALES_AGENT", "VIEWER"],
  "leads:write": ["ORG_ADMIN", "SALES_MANAGER", "SALES_AGENT"],
  "conversations:read": ["ORG_ADMIN", "SALES_MANAGER", "SALES_AGENT", "VIEWER"],
  "conversations:write": ["ORG_ADMIN", "SALES_MANAGER", "SALES_AGENT"],
  "products:read": ["ORG_ADMIN", "SALES_MANAGER", "SALES_AGENT", "VIEWER"],
  "products:write": ["ORG_ADMIN", "SALES_MANAGER"],
  "profile:read": ["ORG_ADMIN", "SALES_MANAGER", "SALES_AGENT", "VIEWER"],
  "profile:write": ["ORG_ADMIN"],
  "memberships:read": ["ORG_ADMIN"],
  "memberships:write": ["ORG_ADMIN"],
  "metrics:read": ["ORG_ADMIN", "SALES_MANAGER", "VIEWER"]
});

export function authorizeTenantOperation({ principal, membership, organizationId, permission }) {
  if (typeof organizationId !== "string" || !organizationId ||
      !principal || typeof principal.userId !== "string" || !principal.userId ||
      !permissions[permission]) {
    return { ok: false, status: 403, reason: "Access denied" };
  }
  // Platform administration is not blanket access to customer data.
  // It requires a separately approved audited impersonation path (not in scope).
  if (!membership || typeof membership !== "object" ||
      membership.user_id !== principal.userId ||
      membership.organization_id !== organizationId ||
      membership.status !== "active" ||
      !TENANT_ROLES.includes(membership.role) ||
      !permissions[permission].includes(membership.role)) {
    return { ok: false, status: 403, reason: "Access denied" };
  }
  return { ok: true, organization_id: organizationId, role: membership.role };
}

export async function resolveTenantAccess({
  principal, organizationId, permission, loadMembership
}) {
  if (typeof loadMembership !== "function" ||
      !principal || typeof principal.userId !== "string" || !principal.userId ||
      typeof organizationId !== "string" || !organizationId) {
    return { ok: false, status: 403, reason: "Access denied" };
  }
  try {
    // This lookup MUST be backed by verified membership persistence.
    // No membership means fail closed, including when storage is unavailable.
    const membership = await loadMembership(principal.userId, organizationId);
    return authorizeTenantOperation({ principal, membership, organizationId, permission });
  } catch {
    return { ok: false, status: 503, reason: "Authorization unavailable" };
  }
}

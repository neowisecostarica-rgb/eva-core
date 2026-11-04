import test from "node:test";
import assert from "node:assert/strict";
import { authorizeTenantOperation, resolveTenantAccess } from "../src/lib/tenantAuthorization.js";

const ada = { userId: "user-ada" };
const ben = { userId: "user-ben" };
const store = [
  { user_id: "user-ada", organization_id: "tenant-menusqr", role: "ORG_ADMIN", status: "active" },
  { user_id: "user-ben", organization_id: "tenant-other", role: "VIEWER", status: "active" },
];
const loadMembership = async (userId, organizationId) =>
  store.find(m => m.user_id === userId && m.organization_id === organizationId) || null;

test("isolates two tenants, including direct cross-ID access attempts", async () => {
  assert.equal((await resolveTenantAccess({ principal: ada, organizationId: "tenant-menusqr", permission: "leads:read", loadMembership })).ok, true);
  for (const permission of ["leads:read", "leads:write", "products:read", "profile:write", "conversations:read"]) {
    const denied = await resolveTenantAccess({ principal: ada, organizationId: "tenant-other", permission, loadMembership });
    assert.equal(denied.ok, false, permission);
    assert.equal((await resolveTenantAccess({ principal: ben, organizationId: "tenant-menusqr", permission, loadMembership })).ok, false, permission);
  }
});

test("enforces role policies and denies platform admin implicit tenant access", async () => {
  assert.equal((await resolveTenantAccess({ principal: ben, organizationId: "tenant-other", permission: "leads:read", loadMembership })).ok, true);
  assert.equal((await resolveTenantAccess({ principal: ben, organizationId: "tenant-other", permission: "leads:write", loadMembership })).ok, false);
  assert.equal((await resolveTenantAccess({ principal: ada, organizationId: "tenant-menusqr", permission: "memberships:write", loadMembership })).ok, true);
  assert.equal(authorizeTenantOperation({ principal: { userId: "super" }, membership: { user_id: "super", organization_id: "tenant-menusqr", role: "SUPER_ADMIN", status: "active" }, organizationId: "tenant-menusqr", permission: "leads:read" }).ok, false);
});

test("denies revoked membership, impersonation and injected roles", async () => {
  for (const membership of [
    { ...store[0], status: "revoked" },
    { ...store[0], user_id: "another" },
    { ...store[0], role: "root" },
    { ...store[0], organization_id: "tenant-other" },
    null
  ]) {
    assert.equal(authorizeTenantOperation({ principal: ada, membership, organizationId: "tenant-menusqr", permission: "leads:read" }).ok, false);
  }
  assert.equal((await resolveTenantAccess({ principal: ada, organizationId: "tenant-menusqr", permission: "leads:read", loadMembership: async () => { throw new Error("db down"); } })).status, 503);
  assert.equal((await resolveTenantAccess({ principal: ada, organizationId: "tenant-menusqr", permission: "leads:read" })).ok, false);
  assert.equal((await resolveTenantAccess({ principal: { role: "ORG_ADMIN" }, organizationId: "tenant-menusqr", permission: "leads:read", loadMembership })).ok, false);
});

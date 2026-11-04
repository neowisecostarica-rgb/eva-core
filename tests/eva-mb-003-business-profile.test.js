import test from "node:test";
import assert from "node:assert/strict";
import { buildBusinessProfileUpdate } from "../src/lib/businessProfilePolicy.js";
import { verifyServiceIdentity } from "../src/lib/auth.js";

test("business profile update uses authenticated tenant and known columns", () => {
  const auth = verifyServiceIdentity({
    providedKey: "secret", configuredKey: "secret",
    expectedOrg: "tenant-a", requestedOrg: "tenant-a"
  });
  assert.equal(auth.ok, true);
  const result = buildBusinessProfileUpdate({ business_name: "Menús QR", delivery_available: false }, auth.organization_id);
  assert.equal(result.ok, true);
  assert.deepEqual(result.values, ["tenant-a", "Menús QR", false]);
  assert.match(result.query, /WHERE organization_id = \$1/);
  assert.match(result.query, /business_name = \$2/);
});

test("cross-tenant identity is denied before business profile access", () => {
  const denied = verifyServiceIdentity({
    providedKey: "secret", configuredKey: "secret",
    expectedOrg: "tenant-a", requestedOrg: "tenant-b"
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.status, 403);
});

test("mass-assignment and SQL identifier payloads are rejected", () => {
  for (const body of [
    { organization_id: "tenant-b" },
    { id: "another" },
    { "business_name = 'x', organization_id": "tenant-b" },
    { "business_name; DROP TABLE business_profile; --": "x" },
    { delivery_available: "yes" },
    {},
    [],
    null
  ]) {
    assert.equal(buildBusinessProfileUpdate(body, "tenant-a").ok, false);
  }
  assert.equal(buildBusinessProfileUpdate({ business_name: "X" }, "").ok, false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { verifyServiceIdentity } from "../src/lib/auth.js";

const standard = { configuredKey: "test-secret", expectedOrg: "tenant-a" };
test("reuses legacy tenant after authenticating correct service identity", () => {
  assert.deepEqual(verifyServiceIdentity({ ...standard, providedKey: "test-secret", requestedOrg: "tenant-a" }), { ok: true, organization_id: "tenant-a" });
  assert.equal(verifyServiceIdentity({ ...standard, providedKey: "test-secret" }).ok, true);
});
test("rejects missing/incorrect credentials and cross-tenant header", () => {
  for (const input of [
    { providedKey: "" },
    { providedKey: "wrong" },
    { providedKey: "test-secret", requestedOrg: "tenant-b" },
    { providedKey: "test-secret", requestedOrg: ["tenant-a"] },
  ]) {
    assert.equal(verifyServiceIdentity({ ...standard, ...input }).ok, false);
  }
});
test("fails closed when service configuration is absent", () => {
  assert.equal(verifyServiceIdentity({ ...standard, configuredKey: "", providedKey: "test-secret" }).ok, false);
  assert.equal(verifyServiceIdentity({ ...standard, expectedOrg: "", providedKey: "test-secret" }).ok, false);
});

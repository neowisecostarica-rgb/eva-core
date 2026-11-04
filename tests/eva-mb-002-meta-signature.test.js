import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { isValidMetaSignature } from "../src/lib/metaSignature.js";

test("valid signed Meta payload", () => {
  const body = Buffer.from('{"entry":[{"id":"example"}]}', "utf8");
  const signature = "sha256=" + createHmac("sha256", "test-secret").update(body).digest("hex");
  assert.equal(isValidMetaSignature(body, signature, "test-secret"), true);
  assert.equal(isValidMetaSignature(Buffer.from('{"entry":[]}'), signature, "test-secret"), false);
});
test("rejects missing, malformed and absent secret", () => {
  const body = Buffer.from("{}");
  assert.equal(isValidMetaSignature(body, undefined, "test-secret"), false);
  assert.equal(isValidMetaSignature(body, "sha256=notvalid", "test-secret"), false);
  assert.equal(isValidMetaSignature(body, "sha256=" + "a".repeat(64), ""), false);
  assert.equal(isValidMetaSignature({}, "sha256=" + "a".repeat(64), "test-secret"), false);
});

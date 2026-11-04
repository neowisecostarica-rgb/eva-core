import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import pg from "pg";

// This test only uses the disposable PostgreSQL service in GitHub Actions.
// It never reads DATABASE_URL or contacts EVA production.
const localUrl = process.env.EVA_TEST_DATABASE_URL;
const allowed = /^postgres(?:ql)?:\/\/eva_test:eva_test@(?:127\.0\.0\.1|localhost):5432\/eva_test$/;
if (!localUrl || !allowed.test(localUrl)) {
  throw new Error("Only the isolated eva_test PostgreSQL database on localhost is allowed");
}
const pool = new pg.Pool({ connectionString: localUrl, ssl: false });
try {
  test("conversation-owned message inserts do not cross tenants in real PostgreSQL", async () => {
    const source = await readFile(new URL("../src/db.js", import.meta.url), "utf8");
    const sql = source.match(/INSERT INTO messages \([\s\S]*?\)\s*SELECT \$1, c\.id, \$3, \$4, \$5, NOW\(\)[\s\S]*?WHERE c\.id = \$2 AND c\.organization_id = \$1\s*RETURNING id/)?.[0];
    assert.ok(sql, "Production SQL must retain conversation ownership predicate");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("CREATE TEMP TABLE conversations (id text PRIMARY KEY, organization_id text NOT NULL)");
      await client.query("CREATE TEMP TABLE messages (id bigint GENERATED ALWAYS AS IDENTITY, organization_id text NOT NULL, conversation_id text NOT NULL, role text NOT NULL, content text NOT NULL, external_message_id text, created_at timestamptz NOT NULL)");
      await client.query("INSERT INTO conversations (id,organization_id) VALUES ('conv-a','tenant-a'), ('conv-b','tenant-b')");
      const a = await client.query(sql, ["tenant-a", "conv-a", "user", "hello", "msg-a"]);
      assert.equal(a.rowCount, 1);
      const forbidden = await client.query(sql, ["tenant-a", "conv-b", "user", "must-not-save", "msg-x"]);
      assert.equal(forbidden.rowCount, 0);
      const b = await client.query(sql, ["tenant-b", "conv-b", "user", "hello-b", "msg-b"]);
      assert.equal(b.rowCount, 1);
      const rows = await client.query("SELECT organization_id, conversation_id FROM messages ORDER BY id");
      assert.deepEqual(rows.rows, [
        { organization_id: "tenant-a", conversation_id: "conv-a" },
        { organization_id: "tenant-b", conversation_id: "conv-b" }
      ]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
} finally {
  // Close after the node:test queue has executed, not before it.
}
test.after(async () => pool.end());

import test from "node:test";
import assert from "node:assert/strict";

import { observeRequest, StructuredLogger, UsageMetrics } from "../Alex/observability/index.js";

function testLogger() {
  const entries = [];
  return { logger: new StructuredLogger({ log: (entry) => entries.push(entry), error: (entry) => entries.push(entry) }), entries };
}

test("observes requests with correlation IDs, timing, metrics, and safe logs", async () => {
  const { logger, entries } = testLogger();
  const usage = new UsageMetrics();
  const response = await observeRequest(
    new Request("https://example.test/private?token=do-not-log", { headers: { "x-request-id": "trace-1" } }),
    async () => new Response("ok"),
    { log: logger, usage },
  );

  assert.equal(response.headers.get("X-Request-ID"), "trace-1");
  assert.equal(usage.get("requests.total"), 1);
  assert.equal(usage.get("responses.200"), 1);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].includes("do-not-log"), false);
  assert.match(entries[0], /request\.complete/);
});

test("generates a safe ID and hides thrown error details", async () => {
  const { logger, entries } = testLogger();
  const response = await observeRequest(
    new Request("https://example.test/fail", { headers: { "x-request-id": "bad id" } }),
    async () => { throw new Error("password=secret stack trace"); },
    { log: logger, usage: new UsageMetrics() },
  );

  assert.equal(response.status, 500);
  assert.notEqual(response.headers.get("X-Request-ID"), "bad id");
  assert.equal((await response.text()).includes("secret"), false);
  assert.equal(entries.some((entry) => entry.includes("password") || entry.includes("stack trace")), false);
  assert.equal(entries.filter((entry) => entry.includes("request.error")).length, 1);
});

test("metrics provide basic usage snapshots", () => {
  const usage = new UsageMetrics();
  usage.increment("requests.total");
  usage.increment("requests.total", 2);
  assert.deepEqual(usage.snapshot(), { "requests.total": 3 });
});
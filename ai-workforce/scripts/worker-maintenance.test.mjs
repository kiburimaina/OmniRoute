import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig, recoverOnce } from "./worker-maintenance.mjs";

const validEnv = {
  AI_WORKFORCE_API_URL: "https://workforce.example.com/",
  WORKER_SHARED_SECRET: "x".repeat(32),
};

test("requires a strong secret and API URL", () => {
  assert.throws(() => loadConfig({}), /required/);
  assert.throws(() => loadConfig({ ...validEnv, WORKER_SHARED_SECRET: "short" }), /32 bytes/);
});

test("rejects insecure remote URLs and invalid recovery bounds", () => {
  assert.throws(() => loadConfig({ ...validEnv, AI_WORKFORCE_API_URL: "http://workforce.example.com" }), /HTTPS/);
  assert.throws(() => loadConfig({ ...validEnv, WORKER_LEASE_SECONDS: "10" }), /30 to 3600/);
  assert.throws(() => loadConfig({ ...validEnv, WORKER_RECOVERY_INTERVAL_MS: "1000" }), /15000 to 3600000/);
});

test("allows localhost HTTP and applies bounded defaults", () => {
  const config = loadConfig({ ...validEnv, AI_WORKFORCE_API_URL: "http://localhost:3000" });
  assert.equal(config.apiUrl, "http://localhost:3000");
  assert.equal(config.leaseSeconds, 300);
  assert.equal(config.recoveryIntervalMs, 60_000);
});

test("posts only the lease threshold and authenticates without exposing the secret in logs", async () => {
  let request;
  const result = await recoverOnce(loadConfig(validEnv), async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ recovered: 2, organizations: [{ organizationId: "org", count: 2 }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  assert.equal(request.url, "https://workforce.example.com/api/internal/worker/recover");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.authorization, `Bearer ${validEnv.WORKER_SHARED_SECRET}`);
  assert.deepEqual(JSON.parse(request.options.body), { leaseSeconds: 300 });
  assert.equal(result.recovered, 2);
});

test("rejects malformed success payloads and non-success responses", async () => {
  const config = loadConfig(validEnv);
  await assert.rejects(() => recoverOnce(config, async () => new Response("{}", { status: 200 })), /invalid response/);
  await assert.rejects(() => recoverOnce(config, async () => new Response("unavailable", { status: 503 })), /HTTP 503/);
});

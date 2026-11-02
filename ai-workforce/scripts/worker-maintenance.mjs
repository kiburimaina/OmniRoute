#!/usr/bin/env node
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function loadConfig(env = process.env) {
  const rawUrl = env.AI_WORKFORCE_API_URL;
  const secret = env.WORKER_SHARED_SECRET;
  if (!rawUrl || !secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("AI_WORKFORCE_API_URL and a WORKER_SHARED_SECRET of at least 32 bytes are required");
  }
  const apiUrl = new URL(rawUrl);
  if (!["http:", "https:"].includes(apiUrl.protocol)) throw new Error("API URL must use HTTP or HTTPS");
  if (apiUrl.protocol !== "https:" && !["localhost", "127.0.0.1", "::1"].includes(apiUrl.hostname)) {
    throw new Error("HTTPS is required except for localhost development");
  }
  const leaseSeconds = Number(env.WORKER_LEASE_SECONDS ?? 300);
  const recoveryIntervalMs = Number(env.WORKER_RECOVERY_INTERVAL_MS ?? 60_000);
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 30 || leaseSeconds > 3600) {
    throw new Error("WORKER_LEASE_SECONDS must be an integer from 30 to 3600");
  }
  if (!Number.isInteger(recoveryIntervalMs) || recoveryIntervalMs < 15_000 || recoveryIntervalMs > 3_600_000) {
    throw new Error("WORKER_RECOVERY_INTERVAL_MS must be an integer from 15000 to 3600000");
  }
  return { apiUrl: apiUrl.toString().replace(/\/$/, ""), secret, leaseSeconds, recoveryIntervalMs };
}

function log(level, event, fields = {}) {
  process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...fields }) + "\n");
}

export async function recoverOnce(config, fetchImpl = fetch, signal) {
  const response = await fetchImpl(`${config.apiUrl}/api/internal/worker/recover`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.secret}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ leaseSeconds: config.leaseSeconds }),
    signal,
    redirect: "error",
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 500);
    throw new Error(`Recovery API returned HTTP ${response.status}: ${body}`);
  }
  const result = await response.json();
  if (!Number.isInteger(result.recovered) || result.recovered < 0 || !Array.isArray(result.organizations)) {
    throw new Error("Recovery API returned an invalid response");
  }
  return result;
}

export async function run(config, { fetchImpl = fetch, signal } = {}) {
  let stopping = false;
  let inFlight;
  const stop = () => { stopping = true; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  log("info", "worker_maintenance_started", {
    apiUrl: config.apiUrl,
    leaseSeconds: config.leaseSeconds,
    recoveryIntervalMs: config.recoveryIntervalMs,
    mode: "lease-recovery-only",
  });
  try {
    while (!stopping && !signal?.aborted) {
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      inFlight = recoverOnce(config, fetchImpl, controller.signal);
      try {
        const result = await inFlight;
        log("info", "lease_recovery_completed", result);
      } catch (error) {
        if (!stopping && !signal?.aborted) {
          log("error", "lease_recovery_failed", { message: error instanceof Error ? error.message : "Unknown error" });
        }
      } finally {
        signal?.removeEventListener("abort", abort);
        inFlight = undefined;
      }
      if (!stopping && !shutdown.signal.aborted) {\n        await Promise.race([delay(config.recoveryIntervalMs), new Promise((resolveWait) => shutdown.signal.addEventListener("abort", resolveWait, { once: true }))]);\n      }
    }
  } finally {
    if (inFlight) await inFlight.catch(() => {});
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    log("info", "worker_maintenance_stopped");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run(loadConfig());
  } catch (error) {
    log("fatal", "worker_maintenance_startup_failed", { message: error instanceof Error ? error.message : "Unknown error" });
    process.exitCode = 1;
  }
}

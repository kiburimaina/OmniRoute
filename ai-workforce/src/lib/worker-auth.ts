import "server-only";
import { timingSafeEqual } from "node:crypto";
import { HttpError } from "./db";

export function requireWorkerAuthentication(request: Request): void {
  const configured = process.env.WORKER_SHARED_SECRET;
  if (!configured || new TextEncoder().encode(configured).byteLength < 32) {
    throw new HttpError(503, "Worker authentication is not configured");
  }
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([\x21-\x7E]+)$/.exec(authorization);
  if (!match) throw new HttpError(401, "Worker authentication required");
  const expected = Buffer.from(configured, "utf8");
  const supplied = Buffer.from(match[1], "utf8");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new HttpError(401, "Worker authentication failed");
  }
}

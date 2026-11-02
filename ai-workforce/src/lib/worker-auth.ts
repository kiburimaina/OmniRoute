import "server-only";
import { timingSafeEqual } from "node:crypto";
import { HttpError } from "./db";

export function requireWorkerAuthentication(request: Request): void {
  const configured = process.env.WORKER_SHARED_SECRET;
  if (!configured || new TextEncoder().encode(configured).byteLength < 32) {
    throw new HttpError(503, "Worker authentication is not configured");
  }
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([\\x21-\\x7E]+)$/.exec(authorization);
  if (!match) throw new HttpError(401, "Worker authentication required");
  const expected = Buffer.from(configured, "utf8");
  const supplied = Buffer.from(match[1], "utf8");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new HttpError(401, "Worker authentication failed");
  }
}

export function getWorkerAllowedOrganizations(): string[] {
  const configured = process.env.WORKER_ALLOWED_ORGANIZATIONS;
  if (!configured) throw new HttpError(503, "Worker organization allowlist is not configured");
  const values = configured.split(",").map((value) => value.trim()).filter(Boolean);
  if (values.length === 0 || values.some((value) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))) {
    throw new HttpError(503, "Worker organization allowlist is invalid");
  }
  return [...new Set(values)];
}

export function requireWorkerOrganizationAccess(organizationId: string): void {
  if (!getWorkerAllowedOrganizations().includes(organizationId)) {
    throw new HttpError(403, "Worker is not authorized for this organization");
  }
}

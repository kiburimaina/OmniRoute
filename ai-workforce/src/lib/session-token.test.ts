import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { verifySessionToken } from "./session-token";

const secret = "test-only-secret-with-at-least-32-bytes";
const userId = "f2c6c7c4-4c7a-4a92-9d31-12d67e1c5f01";

async function token(options: {
  subject?: string;
  issuer?: string;
  audience?: string;
  expires?: string;
  includeIssuedAt?: boolean;
} = {}) {
  const builder = new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(options.subject ?? userId)
    .setIssuer(options.issuer ?? "ai-workforce")
    .setAudience(options.audience ?? "ai-workforce-app");
  if (options.includeIssuedAt !== false) builder.setIssuedAt();
  builder.setExpirationTime(options.expires ?? "10m");
  return builder.sign(new TextEncoder().encode(secret));
}

describe("verifySessionToken", () => {
  it("accepts a correctly signed, unexpired session", async () => {
    expect(await verifySessionToken(await token(), secret)).toBe(userId);
  });

  it("rejects a weak signing secret", async () => {
    expect(await verifySessionToken(await token(), "too-short")).toBeNull();
  });

  it("rejects an expired token", async () => {
    expect(await verifySessionToken(await token({ expires: "1 second ago" }), secret)).toBeNull();
  });

  it("rejects a token with the wrong issuer or audience", async () => {
    expect(await verifySessionToken(await token({ issuer: "other" }), secret)).toBeNull();
    expect(await verifySessionToken(await token({ audience: "other" }), secret)).toBeNull();
  });

  it("rejects a non-UUID subject", async () => {
    expect(await verifySessionToken(await token({ subject: "not-a-uuid" }), secret)).toBeNull();
  });

  it("rejects a token missing issued-at", async () => {
    expect(await verifySessionToken(await token({ includeIssuedAt: false }), secret)).toBeNull();
  });

  it("rejects malformed tokens", async () => {
    expect(await verifySessionToken("not.a.jwt", secret)).toBeNull();
  });
});

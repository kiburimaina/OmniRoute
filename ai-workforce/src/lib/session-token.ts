import { jwtVerify } from "jose";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SESSION_AGE_SECONDS = 12 * 60 * 60;

export async function verifySessionToken(
  token: string,
  secret: string | undefined,
  issuer = "ai-workforce",
  audience = "ai-workforce-app",
): Promise<string | null> {
  if (!token || !secret || new TextEncoder().encode(secret).byteLength < 32) {
    return null;
  }

  try {
    const { payload, protectedHeader } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      {
        algorithms: ["HS256"],
        issuer,
        audience,
        clockTolerance: 5,
      },
    );

    if (protectedHeader.alg !== "HS256") return null;
    if (typeof payload.sub !== "string" || !UUID_PATTERN.test(payload.sub)) return null;
    if (typeof payload.exp !== "number" || typeof payload.iat !== "number") return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.iat > now + 5) return null;
    if (now - payload.iat > MAX_SESSION_AGE_SECONDS) return null;
    if (payload.exp <= now - 5 || payload.exp <= payload.iat) return null;

    return payload.sub;
  } catch {
    return null;
  }
}

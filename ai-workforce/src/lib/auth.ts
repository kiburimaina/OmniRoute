import "server-only";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { z } from "zod";

const SessionClaims = z.object({
  sub: z.string().uuid(),
});

export async function getSessionUserId(): Promise<string | null> {
  const secretValue = process.env.AUTH_SECRET;
  // HS256 requires a strong, private secret. Fail closed rather than accepting
  // a weak development value in a deployed environment.
  if (!secretValue || new TextEncoder().encode(secretValue).byteLength < 32) return null;

  const token = (await cookies()).get("aw_session")?.value;
  if (!token) return null;

  try {
    const secret = new TextEncoder().encode(secretValue);
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      issuer: process.env.AUTH_ISSUER ?? "ai-workforce",
      audience: process.env.AUTH_AUDIENCE ?? "ai-workforce-app",
    });
    const claims = SessionClaims.safeParse(payload);
    return claims.success ? claims.data.sub : null;
  } catch {
    return null;
  }
}

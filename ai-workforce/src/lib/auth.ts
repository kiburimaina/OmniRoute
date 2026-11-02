import "server-only";
import { cookies } from "next/headers";
import { verifySessionToken } from "./session-token";

export async function getSessionUserId(): Promise<string | null> {
  const token = (await cookies()).get("aw_session")?.value;
  if (!token) return null;

  return verifySessionToken(
    token,
    process.env.AUTH_SECRET,
    process.env.AUTH_ISSUER ?? "ai-workforce",
    process.env.AUTH_AUDIENCE ?? "ai-workforce-app",
  );
}

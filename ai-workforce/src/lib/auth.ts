import "server-only";
import { betterAuth } from "better-auth";
import { Pool } from "pg";

const connectionString = process.env.AUTH_DATABASE_URL;
if (!connectionString) {
  throw new Error("AUTH_DATABASE_URL is required to initialize authentication");
}

const globalForAuth = globalThis as typeof globalThis & { authPool?: Pool };
const authPool = globalForAuth.authPool ?? new Pool({
  connectionString,
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.AUTH_DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
});
if (process.env.NODE_ENV !== "production") globalForAuth.authPool = authPool;

export const auth = betterAuth({
  appName: "AI Workforce",
  database: authPool,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    autoSignIn: false,
  },
  session: {
    expiresIn: 60 * 60 * 12,
    updateAge: 60 * 60,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  advanced: {
    database: { generateId: "uuid" },
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  trustedOrigins: process.env.APP_ORIGIN ? [process.env.APP_ORIGIN] : ["http://localhost:3000"],
});

export async function getSessionUserId(): Promise<string | null> {
  const { headers } = await import("next/headers");
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

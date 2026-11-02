"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await authClient.signIn.email({
        email: email.trim().toLowerCase(),
        password,
        callbackURL: "/",
      });
      if (result.error) {
        setError(result.error.message || "Unable to sign in.");
        return;
      }
      router.replace("/");
    } catch {
      setError("We could not reach the authentication service. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand">AI <span>WORKFORCE</span></div>
        <p className="eyebrow">Welcome back</p>
        <h1>Sign in to your workspace</h1>
        {searchParams.get("registered") === "1" && <p className="auth-description" role="status">Your account was created. Sign in to continue to workspace setup.</p>}
        <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="auth-button" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <p className="auth-foot">New here? <Link href="/sign-up">Create an account</Link></p>
      </form>
    </main>
  );
}

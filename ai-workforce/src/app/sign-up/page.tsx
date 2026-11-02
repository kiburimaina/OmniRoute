"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const result = await authClient.signUp.email({ name, email, password, callbackURL: "/onboarding" });
    setBusy(false);
    if (result.error) setError(result.error.message || "Unable to create account.");
    else router.replace("/onboarding");
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand">AI <span>WORKFORCE</span></div>
        <p className="eyebrow">Get started</p>
        <h1>Create your account</h1>
        <label>Your name<input autoComplete="name" required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} /><small>Use at least 12 characters.</small></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="auth-button" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
        <p className="auth-foot">Already registered? <Link href="/sign-in">Sign in</Link></p>
      </form>
    </main>
  );
}

"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session = await authClient.getSession();
      if (!session.data?.user) {
        router.replace("/sign-in");
        return;
      }
      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Could not create your workspace.");
        return;
      }
      router.replace("/");
    } catch {
      setError("We could not reach the service. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand">AI <span>WORKFORCE</span></div>
        <p className="eyebrow">One last step</p>
        <h1>Create your workspace</h1>
        <p className="auth-description">Give your organisation a name. You will become its owner and can invite your team later.</p>
        <label>Organisation name<input required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Equiserve" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="auth-button" disabled={busy}>{busy ? "Creating workspace…" : "Create workspace"}</button>
      </form>
    </main>
  );
}

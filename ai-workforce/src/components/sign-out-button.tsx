"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  return <button className="nav-item signout" type="button" onClick={signOut} disabled={busy}>{busy ? "Signing out…" : "Sign out"}</button>;
}

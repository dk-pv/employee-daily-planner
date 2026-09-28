"use client";

import { useState, type FormEvent } from "react";
import { Alert, btnPrimary, fieldInput, fieldLabel } from "@/components/ui/ui";

type Portal = "STAFF" | "ADMIN";

export function LoginForm() {
  const [portal, setPortal] = useState<Portal>("STAFF");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password"), portal }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Sign in failed. Please try again.");
      // Full navigation so no pre-login page state survives.
      window.location.replace(body.redirectTo);
    } catch (err) {
      setError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "Network error. Please try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div role="tablist" aria-label="Sign in as" className="grid grid-cols-2 rounded-lg bg-neutral-100 p-1">
        {(["STAFF", "ADMIN"] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={portal === p}
            onClick={() => setPortal(p)}
            className={`rounded-md py-1.5 text-sm font-medium transition-colors ${
              portal === p ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {p === "STAFF" ? "Staff" : "Admin"}
          </button>
        ))}
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <div>
        <label htmlFor="email" className={fieldLabel}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="Enter your email"
          required
          autoFocus
          className={fieldInput}
        />
      </div>
      <div>
        <label htmlFor="password" className={fieldLabel}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={fieldInput}
        />
      </div>
      <button type="submit" disabled={pending} className={`${btnPrimary} w-full`}>
        {pending ? "Signing in…" : `Sign in to ${portal === "STAFF" ? "Daily Planner" : "Admin Panel"}`}
      </button>
    </form>
  );
}

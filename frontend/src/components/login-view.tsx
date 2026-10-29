"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useGymData } from "@/components/gym-data-provider";
import { apiFetch } from "@/lib/api-client";

interface GymBranding {
  gymName: string;
  logoText: string;
}

export function LoginView() {
  const { currentUser, authError, signIn } = useGymData();
  const [branding, setBranding] = useState<GymBranding>({
    gymName: "Gym",
    logoText: "GYM",
  });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch("/public/branding/")
      .then(async (response) => {
        if (!response.ok) throw new Error(`Gym branding request failed (${response.status}).`);
        return (await response.json()) as GymBranding;
      })
      .then((data) => {
        if (active) setBranding(data);
      })
      .catch((reason: unknown) => {
        console.error("Could not load gym branding.", reason);
      });
    return () => {
      active = false;
    };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signIn(username.trim(), password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-sm font-semibold text-white">{branding.logoText || "GYM"}</span>
            <p className="text-sm font-medium text-slate-500">{branding.gymName || "Gym"}</p>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">
            {currentUser ? "Already signed in" : "Sign in"}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {currentUser
              ? `You are signed in as ${currentUser.username}. Your ${currentUser.role} dashboard is loading.`
              : "Use the same sign-in page for every gym account. Your role determines which dashboard and tools are available."}
          </p>
        </div>
        {currentUser ? (
          <Link href={currentUser.role === "member" ? "/portal" : "/"} className="inline-flex rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white">
            {currentUser.role === "member" ? "Continue to member portal" : "Continue to dashboard"}
          </Link>
        ) : (
          <>
            <label className="block text-sm font-medium text-slate-700">
              Username
              <input
                autoComplete="username"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Password
              <input
                autoComplete="current-password"
                required
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3"
              />
            </label>
            {authError || error ? (
              <p role="alert" className="text-sm text-rose-700">{error || authError}</p>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </>
        )}
      </form>
    </main>
  );
}

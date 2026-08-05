"use client";

import { AlertTriangle, Download, Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/hooks/useAuth";

export default function SettingsPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-muted">
        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
      </div>
    );
  }

  // Middleware redirects unauthenticated users away from /settings, but the
  // page still renders a signed-out state: middleware only checks the JWT
  // signature, so a token for a deleted or banned account passes it and the
  // client-side session lookup is what actually comes back empty.
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-text">Sign in to manage your account</h1>
        <Link
          href="/signin"
          className="mt-5 inline-block rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/v1/auth/delete-account", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        let detail = "Could not delete the account.";
        try {
          detail = (await res.json())?.detail || detail;
        } catch {
          /* non-JSON error body */
        }
        setDeleteError(detail);
        return;
      }

      // The server already cleared the cookies; signOut() clears the local
      // session state and notifies the other auth surfaces so the header stops
      // showing a signed-in user on the way out.
      await signOut();
      router.push("/");
    } catch {
      setDeleteError("Network error. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-text">Account settings</h1>
      <p className="mt-2 text-sm text-muted">Manage your data and your account.</p>

      <section className="mt-8 rounded-2xl border border-border bg-panel p-5">
        <h2 className="text-sm font-semibold text-text">Profile</h2>
        <dl className="mt-4 space-y-2 text-sm">
          {[
            ["Name", user.name],
            ["Email", user.email],
            ["Plan", user.tier === "premium" ? "Premium" : "Free"],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-muted">{label}</dt>
              <dd className="text-right font-medium text-text">{value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Email verified</dt>
            <dd className="text-right font-medium">
              {user.verified_email ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <ShieldCheck className="h-3.5 w-3.5" /> Verified
                </span>
              ) : (
                <span className="text-muted">Not verified</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-5 rounded-2xl border border-border bg-panel p-5">
        <h2 className="text-sm font-semibold text-text">Export your data</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Download everything we hold for your account — profile, portfolio holdings, watchlist, and
          any premium requests — as a JSON file. Security credentials are excluded.
        </p>
        <a
          href="/api/v1/auth/export-data"
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-bg px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-accent/50"
        >
          <Download className="h-4 w-4" />
          Download my data
        </a>
      </section>

      <section className="mt-5 rounded-2xl border border-danger/40 bg-panel p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-danger">
          <AlertTriangle className="h-4 w-4" />
          Delete account
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          This permanently removes your account, portfolio, and watchlist. It cannot be undone.
          Consider downloading your data first.
        </p>

        {!confirmOpen ? (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="mt-4 rounded-xl border border-danger/50 px-4 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger/10"
          >
            Delete my account
          </button>
        ) : (
          <div className="mt-4 space-y-3">
            <label htmlFor="confirm-password" className="block text-sm text-muted">
              Enter your password to confirm
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
            {deleteError ? <p className="text-sm text-danger">{deleteError}</p> : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || !password}
                className="inline-flex items-center gap-2 rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Permanently delete
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  setPassword("");
                  setDeleteError("");
                }}
                className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

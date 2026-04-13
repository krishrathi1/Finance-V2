"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle, Clock, XCircle } from "lucide-react";

type PremiumRequest = {
  id: number;
  status: "pending" | "approved" | "rejected";
  reason: string;
  requested_at: string;
  processed_at?: string;
};

export default function PremiumRequestPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [existingRequest, setExistingRequest] = useState<PremiumRequest | null>(null);

  // Fetch existing request
  useEffect(() => {
    const fetchRequest = async () => {
      try {
        const res = await fetch("/api/v1/auth/premium-request", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setExistingRequest(data);
        }
      } catch (err) {
        console.error("Failed to fetch request:", err);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      // If already premium, redirect
      if (user.tier === "premium") {
        router.replace("/dashboard");
        return;
      }
      fetchRequest();
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!reason.trim() || reason.length < 10) {
      setError("Please provide at least 10 characters explaining why you need premium");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/auth/premium-request", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Failed to submit request");
      }

      setSuccess(true);
      setReason("");
      // Refresh existing request
      const checkRes = await fetch("/api/v1/auth/premium-request", {
        credentials: "include",
      });
      if (checkRes.ok) {
        setExistingRequest(await checkRes.json());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-200px)] bg-gradient-to-b from-bg via-bg/95 to-bg pb-12">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back Button */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-muted/60 hover:text-muted mb-6 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="font-[var(--font-space)] text-3xl font-bold text-text">
            Request Premium Access
          </h1>
          <p className="mt-2 text-muted">
            Tell us why you'd like to upgrade your account to access premium features
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Main Form */}
          <div className="lg:col-span-2">
            {/* Existing Request Status */}
            {existingRequest && (
              <div
                className={`mb-8 rounded-2xl border p-6 shadow-xl backdrop-blur-sm ${
                  existingRequest.status === "pending"
                    ? "border-yellow-500/30 bg-yellow-500/5"
                    : existingRequest.status === "approved"
                      ? "border-green-500/30 bg-green-500/5"
                      : "border-red-500/30 bg-red-500/5"
                }`}
              >
                <div className="flex items-start gap-4">
                  {existingRequest.status === "pending" && (
                    <Clock className="h-6 w-6 text-yellow-500 flex-shrink-0 mt-1" />
                  )}
                  {existingRequest.status === "approved" && (
                    <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
                  )}
                  {existingRequest.status === "rejected" && (
                    <XCircle className="h-6 w-6 text-red-500 flex-shrink-0 mt-1" />
                  )}

                  <div className="flex-1">
                    <h3 className="font-[var(--font-space)] font-bold text-text capitalize">
                      Request Status: {existingRequest.status}
                    </h3>
                    <p className="mt-1 text-sm text-muted">
                      Submitted on {new Date(existingRequest.requested_at).toLocaleDateString()}
                    </p>

                    {existingRequest.status === "approved" && (
                      <p className="mt-3 text-sm font-medium text-green-600">
                        ✓ Your account has been upgraded to Premium! Please refresh the page to see changes.
                      </p>
                    )}

                    {existingRequest.status === "pending" && (
                      <p className="mt-3 text-sm text-yellow-600">
                        Your request is under review. An admin will contact you soon.
                      </p>
                    )}

                    {existingRequest.status === "rejected" && (
                      <p className="mt-3 text-sm text-red-600">
                        Your request was not approved at this time. You can submit a new request below.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Form */}
            {!existingRequest || existingRequest.status === "rejected" ? (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="rounded-2xl border border-border/60 bg-panel/70 p-6 shadow-xl backdrop-blur-sm sm:p-7">
                  {error && (
                    <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
                      {error}
                    </div>
                  )}

                  {success && (
                    <div className="mb-6 rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-400">
                      ✓ Request submitted successfully! An admin will review your request shortly.
                    </div>
                  )}

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-text" htmlFor="reason">
                      Why do you want premium access?
                    </label>
                    <p className="mb-3 text-xs text-muted">Minimum 10 characters required</p>
                    <textarea
                      id="reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Tell us how premium features will help you..."
                      className="h-40 w-full rounded-xl border border-border/60 bg-bg/60 px-4 py-3 text-sm text-text outline-none transition placeholder:text-muted/40 focus:border-accent/60 focus:ring-2 focus:ring-accent/20 resize-none"
                      disabled={submitting}
                    />
                  </div>

                  <div className="mt-6 flex gap-3">
                    <button
                      type="submit"
                      disabled={submitting || reason.length < 10}
                      className="inline-flex h-11 items-center justify-center rounded-xl bg-accent px-6 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? "Submitting..." : "Submit Request"}
                    </button>
                    <Link
                      href="/dashboard"
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-border/60 bg-bg/60 px-6 text-sm font-semibold text-text transition hover:bg-panel/60"
                    >
                      Cancel
                    </Link>
                  </div>
                </div>
              </form>
            ) : (
              <div className="rounded-2xl border border-border/60 bg-panel/70 p-6 shadow-xl backdrop-blur-sm sm:p-7 text-center">
                <p className="text-muted">Your request is currently under review.</p>
                <p className="mt-2 text-sm text-muted/60">
                  Please check back later or contact support for updates.
                </p>
              </div>
            )}
          </div>

          {/* Sidebar - Premium Benefits */}
          <div>
            <div className="rounded-2xl border border-accent/30 bg-accent/5 p-6 shadow-xl backdrop-blur-sm sticky top-24">
              <h3 className="font-[var(--font-space)] font-bold text-text mb-4">
                Premium Features
              </h3>
              <ul className="space-y-3">
                {[
                  "Advanced Stock Screener",
                  "Unlimited Watchlist",
                  "Portfolio Tracking",
                  "Custom Price Alerts",
                  "AI Chat Analysis",
                  "Export Reports",
                  "Priority Support",
                ].map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-accent" />
                    <span className="text-sm text-muted">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

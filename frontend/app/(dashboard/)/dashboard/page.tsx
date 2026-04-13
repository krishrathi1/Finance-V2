"use client";

import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Crown, Lock, Zap, TrendingUp } from "lucide-react";

type PremiumRequest = {
  id: number;
  status: "pending" | "approved" | "rejected";
  reason: string;
  requested_at: string;
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [premiumRequest, setPremiumRequest] = useState<PremiumRequest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPremiumRequest = async () => {
      try {
        const res = await fetch("/api/v1/auth/premium-request", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setPremiumRequest(data);
        }
      } catch (err) {
        console.error("Failed to fetch premium request:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPremiumRequest();
  }, []);

  if (!user) return null;

  const isPremium = user.tier === "premium";

  return (
    <div className="min-h-[calc(100vh-200px)] bg-gradient-to-b from-bg via-bg/95 to-bg pb-12">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="font-[var(--font-space)] text-3xl font-bold text-text">
            Welcome back, <span className="text-accent">{user.name}</span>
          </h1>
          <p className="mt-2 text-muted">Manage your portfolio and explore premium features</p>
        </div>

        {/* Tier Card */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Current Tier */}
          <div className={`rounded-2xl border p-6 shadow-xl backdrop-blur-sm ${
            isPremium
              ? "border-yellow-500/30 bg-yellow-500/5"
              : "border-border/60 bg-panel/70"
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted">Current Plan</p>
                <p className="mt-2 font-[var(--font-space)] text-2xl font-bold text-text capitalize">
                  {user.tier}
                </p>
              </div>
              {isPremium ? (
                <Crown className="h-8 w-8 text-yellow-500" />
              ) : (
                <Lock className="h-8 w-8 text-muted/40" />
              )}
            </div>
          </div>

          {/* Premium Status */}
          {!isPremium && (
            <div className="rounded-2xl border border-accent/30 bg-accent/5 p-6 shadow-xl backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted">Unlock Premium</p>
                  <p className="mt-2 text-sm text-accent/90">Get advanced features</p>
                </div>
                <Zap className="h-8 w-8 text-accent/70" />
              </div>
            </div>
          )}

          {/* Premium Features */}
          {isPremium && (
            <>
              <div className="rounded-2xl border border-border/60 bg-panel/70 p-6 shadow-xl backdrop-blur-sm">
                <p className="text-xs font-medium text-muted">Advanced Screener</p>
                <p className="mt-2 text-sm text-accent">Enabled ✓</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-panel/70 p-6 shadow-xl backdrop-blur-sm">
                <p className="text-xs font-medium text-muted">Unlimited Watchlist</p>
                <p className="mt-2 text-sm text-accent">Enabled ✓</p>
              </div>
            </>
          )}
        </div>

        {/* Premium Request Section */}
        {!isPremium && (
          <div className="mb-8 rounded-2xl border border-border/60 bg-panel/70 p-6 shadow-xl backdrop-blur-sm sm:p-7">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-[var(--font-space)] text-xl font-bold text-text">
                  Want Premium Features?
                </h2>
                <p className="mt-2 text-sm text-muted">
                  Request upgrade to unlock advanced tools and unlimited access
                </p>

                {!loading && premiumRequest && (
                  <div className="mt-4 rounded-lg border border-border/40 bg-bg/40 p-3">
                    <p className="text-xs font-medium text-muted">Request Status</p>
                    <p className="mt-1 capitalize">
                      <span
                        className={`text-sm font-semibold ${
                          premiumRequest.status === "pending"
                            ? "text-yellow-500"
                            : premiumRequest.status === "approved"
                              ? "text-green-500"
                              : "text-red-500"
                        }`}
                      >
                        {premiumRequest.status}
                      </span>
                    </p>
                    {premiumRequest.status === "pending" && (
                      <p className="mt-2 text-xs text-muted/60">
                        Admin is reviewing your request. You'll be notified once processed.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {!premiumRequest || premiumRequest.status !== "pending" ? (
                <Link
                  href="/premium-request"
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-accent px-6 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Request Premium
                </Link>
              ) : (
                <button
                  disabled
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-border/20 px-6 text-sm font-semibold text-muted/40 cursor-not-allowed"
                >
                  Pending Review
                </button>
              )}
            </div>
          </div>
        )}

        {/* Features Grid */}
        <div>
          <h2 className="mb-4 font-[var(--font-space)] text-xl font-bold text-text">
            Available Features
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Stock Screener */}
            <Link
              href="/screener"
              className="group rounded-2xl border border-border/60 bg-panel/70 p-6 shadow-xl backdrop-blur-sm transition hover:border-accent/40 hover:bg-panel/90"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-[var(--font-space)] font-bold text-text group-hover:text-accent">
                    Stock Screener
                  </h3>
                  <p className="mt-2 text-sm text-muted">
                    Filter stocks by metrics, performance, and more
                  </p>
                </div>
                <TrendingUp className="h-5 w-5 text-muted group-hover:text-accent" />
              </div>
              {!isPremium && (
                <div className="mt-4 flex items-center gap-1 text-xs text-yellow-500">
                  <Lock className="h-3 w-3" />
                  <span>Premium</span>
                </div>
              )}
            </Link>

            {/* Watchlist */}
            <Link
              href="/watchlist"
              className="group rounded-2xl border border-border/60 bg-panel/70 p-6 shadow-xl backdrop-blur-sm transition hover:border-accent/40 hover:bg-panel/90"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-[var(--font-space)] font-bold text-text group-hover:text-accent">
                    Watchlist
                  </h3>
                  <p className="mt-2 text-sm text-muted">
                    Track your favorite stocks and get alerts
                  </p>
                </div>
                <TrendingUp className="h-5 w-5 text-muted group-hover:text-accent" />
              </div>
              {isPremium && (
                <div className="mt-4 text-xs text-green-500 font-medium">Unlimited items</div>
              )}
              {!isPremium && (
                <div className="mt-4 text-xs text-muted/60">Max 5 items (Free)</div>
              )}
            </Link>

            {/* Portfolio Tracker */}
            <Link
              href="/portfolio"
              className="group rounded-2xl border border-border/60 bg-panel/70 p-6 shadow-xl backdrop-blur-sm transition hover:border-accent/40 hover:bg-panel/90"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-[var(--font-space)] font-bold text-text group-hover:text-accent">
                    Portfolio
                  </h3>
                  <p className="mt-2 text-sm text-muted">
                    Manage and track your investments
                  </p>
                </div>
                <TrendingUp className="h-5 w-5 text-muted group-hover:text-accent" />
              </div>
            </Link>
          </div>
        </div>

        {/* Footer Links */}
        <div className="mt-12 flex flex-col gap-2 border-t border-border/20 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-4 text-sm text-muted">
            <Link href="/profile" className="hover:text-accent">
              Profile
            </Link>
            <Link href="/settings" className="hover:text-accent">
              Settings
            </Link>
          </div>
          <p className="text-xs text-muted/60">
            Last updated: {new Date().toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
}

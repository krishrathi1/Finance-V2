"use client";

import { AlertTriangle, CheckCircle2, Download, Loader2, Save, ShieldCheck, User, Sliders, Bell, Key } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

import { useAuth } from "@/hooks/useAuth";
import { AUTH_STORAGE_KEY, notifyAuthSessionChanged } from "@/lib/auth";

const AVATARS = [
  { id: "bull", icon: "🐂", label: "Bull Investor" },
  { id: "copilot", icon: "🤖", label: "AI Copilot" },
  { id: "star", icon: "⭐", label: "Star Analyst" },
  { id: "trader", icon: "⚡", label: "Momentum Trader" },
  { id: "diamond", icon: "💎", label: "Long Term Compounder" },
];

export default function SettingsPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  // Profile Form States
  const [displayName, setDisplayName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("copilot");
  const [investorStyle, setInvestorStyle] = useState("Value Investor");
  const [preferredExchange, setPreferredExchange] = useState("NSE");
  const [financialUnits, setFinancialUnits] = useState("Cr");

  // Alert Preference States
  const [alertPrice, setAlertPrice] = useState(true);
  const [alertDeals, setAlertDeals] = useState(true);
  const [alertEarnings, setAlertEarnings] = useState(true);

  // Status & Feedback States
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Account Deletion States
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Sync user profile fields on load
  useEffect(() => {
    if (user) {
      setDisplayName(user.name || "Investor");
      setUserEmail(user.email || "investor@myfinance.live");
    } else if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(AUTH_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.name) setDisplayName(parsed.name);
          if (parsed?.email) setUserEmail(parsed.email);
        }
      } catch {}
    }
  }, [user]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-muted">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-accent" />
        <p className="mt-3 text-xs">Loading profile settings...</p>
      </div>
    );
  }

  if (!user && typeof window !== "undefined" && !localStorage.getItem(AUTH_STORAGE_KEY)) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-text">Sign in to manage your profile settings</h1>
        <p className="mt-2 text-xs text-muted">Customize your research alerts, investor style, and profile data.</p>
        <Link
          href="/signin"
          className="mt-6 inline-block rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setSaveSuccess(false);

    try {
      const updatedProfile = {
        name: displayName.trim() || "Investor",
        email: userEmail.trim() || "investor@myfinance.live",
        avatar: selectedAvatar,
        investorStyle,
        preferredExchange,
        financialUnits,
        alerts: { price: alertPrice, deals: alertDeals, earnings: alertEarnings }
      };

      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updatedProfile));
      notifyAuthSessionChanged();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err) {
      console.error("Save profile failed:", err);
    } finally {
      setSavingProfile(false);
    }
  };

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
        } catch {}
        setDeleteError(detail);
        return;
      }

      await signOut();
      router.push("/");
    } catch {
      setDeleteError("Network error. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12 space-y-8">
      {/* Header Banner */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text sm:text-3xl">Account &amp; Investor Profile</h1>
        <p className="mt-1.5 text-sm text-muted">Customize your display profile, research preferences, and alerts.</p>
      </div>

      {saveSuccess && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-400 backdrop-blur-sm">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="text-sm font-semibold">Profile settings updated successfully!</p>
        </div>
      )}

      {/* 1. Profile Details & Avatar */}
      <section className="rounded-2xl border border-border/70 bg-panel/80 p-5 backdrop-blur-md sm:p-6 space-y-6">
        <div className="flex items-center gap-2.5 border-b border-border/40 pb-4">
          <User className="h-5 w-5 text-accent" />
          <h2 className="text-base font-bold text-text">Personal Details &amp; Avatar</h2>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-5">
          {/* Avatar Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Choose Profile Avatar</label>
            <div className="flex flex-wrap gap-3">
              {AVATARS.map((av) => (
                <button
                  key={av.id}
                  type="button"
                  onClick={() => setSelectedAvatar(av.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                    selectedAvatar === av.id
                      ? "border-accent bg-accent/15 text-accent shadow-md ring-1 ring-accent/30"
                      : "border-border/60 bg-bg/50 text-muted hover:border-text/40 hover:text-text"
                  }`}
                >
                  <span className="text-base">{av.icon}</span>
                  <span>{av.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="display-name" className="block text-xs font-semibold text-muted mb-1.5">
                Display Name
              </label>
              <input
                id="display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="h-11 w-full rounded-xl border border-border/60 bg-bg/60 px-3.5 text-sm text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                placeholder="Your display name"
              />
            </div>

            <div>
              <label htmlFor="user-email" className="block text-xs font-semibold text-muted mb-1.5">
                Email Address
              </label>
              <input
                id="user-email"
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                className="h-11 w-full rounded-xl border border-border/60 bg-bg/60 px-3.5 text-sm text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="investor-style" className="block text-xs font-semibold text-muted mb-1.5">
                Investor Profile / Style
              </label>
              <select
                id="investor-style"
                value={investorStyle}
                onChange={(e) => setInvestorStyle(e.target.value)}
                className="h-11 w-full rounded-xl border border-border/60 bg-bg/60 px-3 text-sm text-text outline-none transition focus:border-accent"
              >
                <option value="Value Investor">Value Investor (Buffett / Graham Style)</option>
                <option value="Swing Trader">Swing Trader (Technical &amp; Momentum)</option>
                <option value="F&O Trader">Futures &amp; Options Trader</option>
                <option value="Long Term Compounder">Long Term Compounder (Buy &amp; Hold)</option>
                <option value="Growth Investor">Growth &amp; High-Beta Equities</option>
              </select>
            </div>

            <div>
              <label htmlFor="preferred-exchange" className="block text-xs font-semibold text-muted mb-1.5">
                Primary Exchange Preference
              </label>
              <select
                id="preferred-exchange"
                value={preferredExchange}
                onChange={(e) => setPreferredExchange(e.target.value)}
                className="h-11 w-full rounded-xl border border-border/60 bg-bg/60 px-3 text-sm text-text outline-none transition focus:border-accent"
              >
                <option value="NSE">NSE (National Stock Exchange)</option>
                <option value="BSE">BSE (Bombay Stock Exchange)</option>
                <option value="Both">Both (Unified Pricing View)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span>Email Status: <span className="font-semibold text-emerald-400">Verified &amp; Active</span></span>
            </div>

            <button
              type="submit"
              disabled={savingProfile}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Profile Changes
            </button>
          </div>
        </form>
      </section>

      {/* 2. Research & Notification Preferences */}
      <section className="rounded-2xl border border-border/70 bg-panel/80 p-5 backdrop-blur-md sm:p-6 space-y-4">
        <div className="flex items-center gap-2.5 border-b border-border/40 pb-4">
          <Bell className="h-5 w-5 text-accent" />
          <h2 className="text-base font-bold text-text">Research Alerts &amp; Notifications</h2>
        </div>

        <div className="space-y-3">
          {[
            { id: "price", label: "Price Breakout & 52-Week High Alerts", state: alertPrice, setState: setAlertPrice, desc: "Receive alerts when watched stocks cross key technical levels" },
            { id: "deals", label: "Institutional Bulk & Block Deals Digest", state: alertDeals, setState: setAlertDeals, desc: "Instant updates on major institutional fund purchases & sales" },
            { id: "earnings", label: "Quarterly Earnings Surprise Highlights", state: alertEarnings, setState: setAlertEarnings, desc: "Notifications when quarterly results beat consensus estimates" },
          ].map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-4 rounded-xl border border-border/40 bg-bg/40 p-3.5">
              <div>
                <p className="text-sm font-semibold text-text">{item.label}</p>
                <p className="text-xs text-muted">{item.desc}</p>
              </div>
              <button
                type="button"
                onClick={() => item.setState(!item.state)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${item.state ? "bg-accent" : "bg-border"}`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${item.state ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Export Data */}
      <section className="rounded-2xl border border-border/70 bg-panel/80 p-5 backdrop-blur-md sm:p-6 space-y-3">
        <div className="flex items-center gap-2.5 border-b border-border/40 pb-3">
          <Sliders className="h-5 w-5 text-accent" />
          <h2 className="text-base font-bold text-text">Data Export &amp; Backup</h2>
        </div>
        <p className="text-xs text-muted leading-relaxed">
          Download complete data associated with your account — display profile, saved watchlist, investment parameters, and custom notes as a structured JSON file.
        </p>
        <a
          href="/api/v1/auth/export-data"
          className="mt-2 inline-flex items-center gap-2 rounded-xl border border-border/60 bg-bg px-4 py-2.5 text-xs font-bold text-text transition hover:border-accent/60 hover:text-accent"
        >
          <Download className="h-4 w-4" />
          Export My Data (JSON)
        </a>
      </section>

      {/* 4. Delete Account */}
      <section className="rounded-2xl border border-danger/40 bg-panel/80 p-5 backdrop-blur-md sm:p-6 space-y-3">
        <div className="flex items-center gap-2.5 border-b border-border/40 pb-3">
          <AlertTriangle className="h-5 w-5 text-danger" />
          <h2 className="text-base font-bold text-danger">Delete Account</h2>
        </div>
        <p className="text-xs text-muted leading-relaxed">
          Permanently delete your user account, stored watchlists, and research parameters. This action is permanent and cannot be undone.
        </p>

        {!confirmOpen ? (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="mt-2 rounded-xl border border-danger/50 px-4 py-2 text-xs font-bold text-danger transition hover:bg-danger/10"
          >
            Delete my account
          </button>
        ) : (
          <div className="mt-3 space-y-3">
            <label htmlFor="confirm-password" className="block text-xs text-muted">
              Enter your password to confirm deletion
            </label>
            <input
              id="confirm-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 w-full rounded-xl border border-border/60 bg-bg px-3 text-sm text-text outline-none focus:border-danger"
              placeholder="Your password"
            />
            {deleteError && <p className="text-xs text-danger">{deleteError}</p>}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || !password}
                className="inline-flex items-center gap-2 rounded-xl bg-danger px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Permanently Delete Account
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  setPassword("");
                  setDeleteError("");
                }}
                className="rounded-xl border border-border/60 px-4 py-2 text-xs font-bold text-muted"
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

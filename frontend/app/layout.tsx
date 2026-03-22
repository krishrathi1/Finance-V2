import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Manrope, Space_Grotesk } from "next/font/google";

import { DisplaySettingsProvider } from "@/components/display-settings-provider";
import { DisplaySettingsToggle } from "@/components/display-settings-toggle";
import { ModeToggle } from "@/components/mode-toggle";
import { NavLinks } from "@/components/nav-links";
import { MarketTicker } from "@/components/market-ticker";
import { ScrollProgress } from "@/components/scroll-progress";
import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const space = Space_Grotesk({ subsets: ["latin"], variable: "--font-space" });

export const metadata: Metadata = {
  title: {
    default: "StockVision AI | NSE & BSE Intelligence",
    template: "%s | StockVision AI",
  },
  description: "AI-powered Indian stock analysis platform with Smart Scores, risk analysis, financial statements, brokerage reports, and live market data for NSE and BSE.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${manrope.variable} ${space.variable} min-h-screen font-[var(--font-manrope)]`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <DisplaySettingsProvider>
            <ScrollProgress />
            <header className="header-enter sticky top-0 z-40 border-b border-border/40 bg-bg/70 backdrop-blur-xl">
              <div className="mx-auto flex max-w-[1640px] items-center justify-between px-3 py-2 sm:px-4 sm:py-3 md:px-6">
                <div className="min-w-0">
                  <p className="font-[var(--font-space)] text-base font-bold tracking-tight sm:text-xl">
                    <span className="bg-gradient-to-r from-accent to-amber-400 bg-clip-text text-transparent">Financial Forensics</span>
                    {" "}AI
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted sm:mt-1 sm:text-xs">NSE/BSE Intelligence Platform</p>
                </div>
                <div className="flex items-center gap-2 sm:gap-4">
                  <NavLinks />
                  <DisplaySettingsToggle />
                  <ModeToggle />
                </div>
              </div>
              <MarketTicker />
            </header>
            <main className="page-enter mx-auto max-w-[1640px] px-3 py-3 sm:px-4 sm:py-4 md:px-6 md:py-6">{children}</main>

            <footer className="border-t border-border/40 bg-panel/30 backdrop-blur">
              <div className="mx-auto max-w-[1640px] px-4 py-6 md:px-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-[var(--font-space)] text-sm font-bold">
                      <span className="bg-gradient-to-r from-accent to-amber-400 bg-clip-text text-transparent">
                        StockVision AI
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      Smarter investing, powered by AI &mdash; NSE &amp; BSE Intelligence
                    </p>
                  </div>

                  <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    {[
                      { href: "/screener", label: "Screener" },
                      { href: "/watchlist", label: "Watchlist" },
                      { href: "/portfolio", label: "Portfolio" },
                      { href: "/compare", label: "Compare" },
                      { href: "/ipo", label: "IPO" },
                      { href: "/alerts", label: "Alerts" },
                    ].map(({ href, label }) => (
                      <Link
                        key={href}
                        href={href}
                        className="transition hover:text-accent"
                      >
                        {label}
                      </Link>
                    ))}
                  </nav>
                </div>

                <div className="mt-4 flex flex-col items-start justify-between gap-1 border-t border-border/30 pt-4 text-[11px] text-muted sm:flex-row sm:items-center">
                  <p>Data sourced from NSE, BSE &amp; public APIs. Not investment advice.</p>
                  <p>&copy; {new Date().getFullYear()} StockVision AI. All rights reserved.</p>
                </div>
              </div>
            </footer>
          </DisplaySettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

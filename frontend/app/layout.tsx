import type { Metadata, Viewport } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";

import { ModeToggle } from "@/components/mode-toggle";
import { MarketTicker } from "@/components/market-ticker";
import { ScrollProgress } from "@/components/scroll-progress";
import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const space = Space_Grotesk({ subsets: ["latin"], variable: "--font-space" });

export const metadata: Metadata = {
  title: "Financial Forensics AI | NSE & BSE Stock Intelligence",
  description: "AI-powered Indian stock analysis platform with Smart Scores, risk analysis, financial statements, brokerage reports, and live market data for NSE and BSE."
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
              <ModeToggle />
            </div>
            <MarketTicker />
          </header>
          <main className="page-enter mx-auto max-w-[1640px] px-3 py-3 sm:px-4 sm:py-4 md:px-6 md:py-6">{children}</main>

          {/* Footer */}
          <footer className="border-t border-border/40 bg-panel/30 backdrop-blur">
            <div className="mx-auto flex max-w-[1640px] flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted sm:flex-row md:px-6">
              <p className="font-[var(--font-space)] font-medium">
                <span className="text-accent">Financial Forensics AI</span> &mdash; Indian Equity Intelligence
              </p>
              <p>Data sourced from NSE, BSE & public APIs. Not investment advice.</p>
            </div>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}

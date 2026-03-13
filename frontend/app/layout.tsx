import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";

import { ModeToggle } from "@/components/mode-toggle";
import { MarketTicker } from "@/components/market-ticker";
import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const space = Space_Grotesk({ subsets: ["latin"], variable: "--font-space" });

export const metadata: Metadata = {
  title: "Financial Forensics AI",
  description: "AI powered Indian stock intelligence platform"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${manrope.variable} ${space.variable} min-h-screen font-[var(--font-manrope)]`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/80 backdrop-blur">
            <div className="mx-auto flex max-w-[1640px] items-center justify-between px-4 py-3 md:px-6">
              <div>
                <p className="font-[var(--font-space)] text-xl font-bold tracking-tight">Financial Forensics AI</p>
                <p className="mt-1 text-xs text-muted">NSE/BSE Intelligence Platform</p>
              </div>
              <ModeToggle />
            </div>
            <MarketTicker />
          </header>
          <main className="mx-auto max-w-[1640px] px-4 py-4 md:px-6 md:py-6">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}

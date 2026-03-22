import type { Metadata, Viewport } from "next";
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
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <header className="header-enter sticky top-0 z-40 border-b border-border/70 bg-bg/80 backdrop-blur">
            <div className="mx-auto flex max-w-[1640px] items-center justify-between px-3 py-2 sm:px-4 sm:py-3 md:px-6">
              <div className="min-w-0">
                <p className="font-[var(--font-space)] text-base font-bold tracking-tight sm:text-xl">Financial Forensics AI</p>
                <p className="mt-0.5 text-[10px] text-muted sm:mt-1 sm:text-xs">NSE/BSE Intelligence Platform</p>
              </div>
              <ModeToggle />
            </div>
            <MarketTicker />
          </header>
          <main className="page-enter mx-auto max-w-[1640px] px-3 py-3 sm:px-4 sm:py-4 md:px-6 md:py-6">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}

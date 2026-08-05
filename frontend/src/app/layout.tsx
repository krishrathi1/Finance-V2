import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AuthProvider } from "@/hooks/useAuth";
import { FloatingAuth } from "@/components/floating-auth";
import { MarketStatusBadge } from "@/components/market-status-badge";
import { MarketTicker } from "@/components/market-ticker";
import { ModeToggle } from "@/components/mode-toggle";
import { NavLinks } from "@/components/nav-links";
import { ScrollProgress } from "@/components/scroll-progress";
import { SmoothExperience } from "@/components/smooth-experience";
import { ThemeProvider } from "@/components/theme-provider";
import { WatchlistSync } from "@/components/watchlist-sync";
import { OG_IMAGE_PATH, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/shared/seo";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "stock analysis India",
    "NSE BSE stock screener",
    "Indian stock market",
    "share price today",
    "AI stock score",
    "fundamental analysis India",
    "stock research platform",
    "free stock analysis",
    "best stocks to buy India",
    "IPO India",
    "Nifty 50 analysis",
    "Sensex stocks",
    "equity research India",
    "smart score stock",
    "stock risk analysis",
    "financial statements India",
    "brokerage report",
    "stock screener India",
    "portfolio tracker India",
    "stock comparison tool",
    "market cap India",
    "PE ratio India",
    "dividend stocks India",
    "smallcap midcap largecap India",
    "NSE stock data",
    "BSE stock data",
    "mystockvision",
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "Finance",
  classification: "Stock Market Analysis",
  referrer: "origin-when-cross-origin",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: OG_IMAGE_PATH,
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} stock market research preview`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@mystockvision",
    creator: "@mystockvision",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE_PATH],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  other: {
    "theme-color": "#f59e0b",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      alternateName: "My Stock Vision",
      description: SITE_DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en-IN",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_URL}/stocks/{search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/favicon.ico`,
      },
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#webapp`,
      name: SITE_NAME,
      url: SITE_URL,
      applicationCategory: "FinanceApplication",
      operatingSystem: "All",
      description: SITE_DESCRIPTION,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "INR",
      },
      featureList: [
        "AI Smart Score for NSE and BSE stocks",
        "Risk analysis and rating",
        "Financial statements and key ratios",
        "Brokerage research reports",
        "IPO calendar and analysis",
        "Stock screener with filters",
        "Portfolio tracker",
        "Live market data",
      ],
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData),
          }}
        />
      </head>
      <body className="min-h-screen font-[var(--font-manrope)]">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <AuthProvider>
            <WatchlistSync />
            <ScrollProgress />
            <Suspense fallback={null}>
              <SmoothExperience />
            </Suspense>

            <header className="header-enter sticky top-0 z-40 border-b border-border/40 bg-bg/80 backdrop-blur-xl">
              <div className="mx-auto flex max-w-[1640px] items-center justify-between px-3 py-2.5 sm:px-5 sm:py-3 md:px-7">
                <Link href="/" className="group min-w-0 flex-shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-amber-400 shadow-lg shadow-accent/30 transition group-hover:scale-105 group-hover:shadow-accent/50">
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="relative z-10">
                        <polyline points="1,12 5,7 9,10 15,3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="15" cy="3" r="1.5" fill="white" />
                      </svg>
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-[var(--font-space)] text-sm font-bold leading-none tracking-tight sm:text-base">
                        <span className="bg-gradient-to-r from-accent via-amber-400 to-orange-400 bg-clip-text text-transparent">
                          {SITE_NAME}
                        </span>
                        <span className="ml-1 text-text/80">AI</span>
                      </p>
                      <p className="mt-0.5 hidden text-[10px] font-medium text-muted sm:block">
                        NSE and BSE research platform
                      </p>
                    </div>
                  </div>
                </Link>

                <div className="flex items-center gap-1.5 sm:gap-2.5">
                  <NavLinks />
                  <div className="hidden h-4 w-px bg-border/60 sm:block" />
                  <ModeToggle />
                </div>
              </div>

              <div className="border-t border-border/25 bg-bg/40">
                <MarketTicker />
              </div>
            </header>

            <main className="page-enter mx-auto max-w-[1640px] px-3 py-4 sm:px-5 sm:py-5 md:px-7 md:py-7">
              {children}
            </main>
            <FloatingAuth />

            <footer className="mt-12 border-t border-border/40 bg-panel/20 backdrop-blur-sm">
              <div className="h-px w-full bg-gradient-to-r from-transparent via-accent/35 to-transparent" />

              <div className="mx-auto max-w-[1640px] px-5 py-10 md:px-7">
                <div className="grid grid-cols-2 gap-8 sm:grid-cols-2 md:grid-cols-4">
                  <div className="col-span-2 md:col-span-1">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-amber-400 shadow-md shadow-accent/25">
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                          <polyline points="1,12 5,7 9,10 15,3" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="15" cy="3" r="1.5" fill="white" />
                        </svg>
                      </div>
                      <p className="font-[var(--font-space)] text-sm font-bold">
                        <span className="bg-gradient-to-r from-accent to-amber-400 bg-clip-text text-transparent">
                          {SITE_NAME}
                        </span>
                      </p>
                    </div>
                    <p className="mt-3 max-w-[210px] text-xs leading-5 text-muted">
                      AI-powered equity research for NSE and BSE with Smart Scores, risk analysis, and live market data.
                    </p>
                    <div className="mt-3">
                      <MarketStatusBadge />
                    </div>
                  </div>

                  <div>
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted">Tools</p>
                    <nav className="flex flex-col gap-2.5">
                      {[
                        { href: "/screener", label: "Stock Screener" },
                        { href: "/screener", label: "AI Screener" },
                        { href: "/compare", label: "Compare Stocks" },
                        { href: "/portfolio", label: "Portfolio Tracker" },
                      ].map(({ href, label }) => (
                        <Link key={label} href={href} className="text-xs text-muted transition hover:text-accent">
                          {label}
                        </Link>
                      ))}
                    </nav>
                  </div>

                  <div>
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted">Market</p>
                    <nav className="flex flex-col gap-2.5">
                      {[
                        { href: "/watchlist", label: "Watchlist" },
                        { href: "/ipo", label: "IPO Calendar" },
                        { href: "/alerts", label: "Price Alerts" },
                      ].map(({ href, label }) => (
                        <Link key={href} href={href} className="text-xs text-muted transition hover:text-accent">
                          {label}
                        </Link>
                      ))}
                    </nav>
                  </div>

                  <div>
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted">AI Features</p>
                    <div className="flex flex-col gap-2">
                      {["Smart Score", "AI Risk Analysis", "Earnings TLDR", "Portfolio Doctor", "Competitor Verdict"].map((feature) => (
                        <div key={feature} className="flex items-center gap-1.5 text-xs text-muted">
                          <span className="h-1 w-1 flex-shrink-0 rounded-full bg-accent/70" />
                          {feature}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex flex-col items-start justify-between gap-3 border-t border-border/30 pt-5 sm:flex-row sm:items-center">
                  <div className="flex flex-col gap-2">
                    <p className="text-[11px] text-muted/60">
                      Data sourced from NSE, BSE and public APIs. Not investment advice.
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      {[
                        { href: "/disclaimer", label: "Disclaimer" },
                        { href: "/privacy", label: "Privacy Policy" },
                        { href: "/terms", label: "Terms of Service" },
                      ].map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="text-[11px] text-muted/70 underline-offset-2 transition-colors hover:text-accent hover:underline"
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full border border-border/50 bg-panel/60 px-2 py-0.5 text-[10px] font-medium text-muted">
                      Beta v1.0
                    </span>
                    <p className="text-[11px] text-muted/60">
                      &copy; {new Date().getFullYear()} {SITE_NAME}
                    </p>
                  </div>
                </div>
              </div>
            </footer>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

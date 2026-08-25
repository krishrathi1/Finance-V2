import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "next-themes";

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-display-face",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MyStockVision — AI Stock Analysis India for NSE and BSE",
  description:
    "Institutional-grade stock research for Indian markets: live market intelligence, Smart Scores, forensic accounting flags, portfolio diagnostics, screeners and AI research reports for NSE and BSE equities.",
  keywords: [
    "stock analysis india",
    "nse stock research",
    "bse share price",
    "ai stock screener",
    "smart score",
    "portfolio tracker india",
    "ipo tracker",
    "risk analysis",
    "indian stock market",
  ],
  authors: [{ name: "MyStockVision" }],
  openGraph: {
    title: "MyStockVision — AI Stock Analysis India",
    description:
      "Screen, compare, validate and monitor NSE/BSE ideas with live market context and AI-assisted research.",
    siteName: "MyStockVision",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0e16" },
    { media: "(prefers-color-scheme: light)", color: "#f4f6fb" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} antialiased bg-bg text-text`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

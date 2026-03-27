import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "IPO Calendar India 2024-25 — Upcoming & Recent NSE BSE IPOs",
  description:
    "Track all upcoming and recently listed IPOs in India. Dates, GMP, subscription status, allotment, listing price, and AI analysis for every NSE & BSE IPO in 2024-25.",
  keywords: [
    "IPO calendar India 2024",
    "upcoming IPO India",
    "IPO listing date",
    "IPO allotment status",
    "IPO GMP today",
    "NSE IPO 2024",
    "BSE IPO 2025",
    "IPO subscription status",
    "IPO review India",
    "new IPO this week India",
    "SME IPO India",
    "mainboard IPO India",
    "IPO listing price",
    "apply IPO India",
  ],
  alternates: { canonical: "https://mystockvision.com/ipo" },
  openGraph: {
    title: "IPO Calendar India 2024-25 — Upcoming & Recent IPOs",
    description: "All upcoming and recent IPOs on NSE & BSE with dates, GMP, and AI analysis.",
    url: "https://mystockvision.com/ipo",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "IPO Calendar India 2024-25 — Upcoming & Recent IPOs",
    description: "All upcoming and recent IPOs on NSE & BSE with dates, GMP, and AI analysis.",
  },
};

export default function IpoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

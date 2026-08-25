import type { Metadata } from "next";

import { buildPageMetadata } from "@/shared/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "IPO Calendar India - Upcoming and Recent NSE BSE IPOs",
  description:
    "Track upcoming and recent IPOs in India with issue dates, listing details, price range, and AI-assisted analysis for NSE and BSE public issues.",
  path: "/ipo",
  keywords: [
    "IPO calendar India",
    "upcoming IPO India",
    "IPO listing date",
    "IPO GMP today",
    "NSE IPO",
    "BSE IPO",
    "IPO review India",
  ],
});

export default function IpoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

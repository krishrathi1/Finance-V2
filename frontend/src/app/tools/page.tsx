import type { Metadata } from "next";

import { ToolsClient } from "./tools-client";

export const metadata: Metadata = {
  title: "Trading Tools — Brokerage, Position Size & SIP Calculators",
  description:
    "Free calculators for Indian equity: true trade cost with STT, stamp duty and GST, breakeven price, risk-based position sizing, SIP goal planning and CAGR.",
};

export default function ToolsPage() {
  return <ToolsClient />;
}

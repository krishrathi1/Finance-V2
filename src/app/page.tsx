"use client";

import { useEffect } from "react";
import { useApp } from "@/lib/store";
import { Header } from "@/components/shell/header";
import { MarketTicker } from "@/components/shell/market-ticker";
import { Footer } from "@/components/shell/footer";
import { HomeView } from "@/components/home/home-view";
import { StockView } from "@/components/stock/stock-view";
import { DirectoryView } from "@/components/directory/directory-view";
import { ScreenerView } from "@/components/screener/screener-view";
import { CompareView } from "@/components/compare/compare-view";
import { IpoView } from "@/components/ipo/ipo-view";
import { WatchlistView } from "@/components/watchlist/watchlist-view";
import { PortfolioView } from "@/components/portfolio/portfolio-view";
import { AlertsView } from "@/components/alerts/alerts-view";
import { CopilotDrawer } from "@/components/ai/copilot-drawer";

export default function Page() {
  const view = useApp((s) => s.view);
  const hydrate = useApp((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <MarketTicker />
      <main className="mx-auto w-full max-w-[1640px] flex-1 px-3 py-6 sm:px-4 sm:py-8">
        {view === "home" && <HomeView />}
        {view === "stock" && <StockView />}
        {view === "directory" && <DirectoryView />}
        {view === "screener" && <ScreenerView />}
        {view === "compare" && <CompareView />}
        {view === "ipo" && <IpoView />}
        {view === "watchlist" && <WatchlistView />}
        {view === "portfolio" && <PortfolioView />}
        {view === "alerts" && <AlertsView />}
      </main>
      <Footer />
      <CopilotDrawer />
    </div>
  );
}

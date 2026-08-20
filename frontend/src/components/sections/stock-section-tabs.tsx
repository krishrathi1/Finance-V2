"use client";

import { useAuth } from "@/hooks/useAuth";

const allSections = [
  { id: "overview", label: "Overview" },
  { id: "forensics", label: "Forensics & M-Score" },
  { id: "options-chain", label: "Options & Greeks" },
  { id: "corporate-actions", label: "Corporate Actions" },
  { id: "financials", label: "Financials" },
  { id: "shareholding", label: "Shareholding" },
  { id: "key-ratios", label: "Key Ratios" },
  { id: "documents", label: "Documents" }
];

export function StockSectionTabs() {
  const { user, loading } = useAuth();
  const sections = !loading && user ? allSections : allSections.slice(0, 1);

  const handleTabClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const targetEl = document.getElementById(id);
    if (targetEl) {
      const yOffset = -110; // Accounts for sticky header offset
      const y = targetEl.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  return (
    <div className="sticky top-[74px] z-30 -mx-1 overflow-x-auto no-scrollbar rounded-2xl border border-border/80 bg-panel/95 backdrop-blur-xl p-1.5 shadow-lg sm:-mx-0 sm:top-[76px] sm:p-2 md:top-[78px]">
      <div className="flex min-w-max items-center gap-1 sm:gap-1.5">
        {sections.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            onClick={(e) => handleTabClick(e, item.id)}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold text-muted-fg transition-all hover:bg-primary/10 hover:border-primary/40 hover:text-primary active:scale-95 sm:px-3.5 sm:py-2 sm:text-xs border border-transparent"
          >
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}

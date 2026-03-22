"use client";

const sections = [
  { id: "overview", label: "Overview" },
  { id: "corporate-actions", label: "Corporate Actions" },
  { id: "financials", label: "Financials" },
  { id: "shareholding", label: "Shareholding" },
  { id: "key-ratios", label: "Key Ratios" },
  { id: "documents", label: "Documents" }
];

export function StockSectionTabs() {
  return (
    <div className="sticky top-[96px] z-30 -mx-3 overflow-auto rounded-2xl border border-border/70 bg-panel/90 p-1.5 sm:-mx-0 sm:top-[118px] sm:p-2 md:top-[122px]">
      <div className="flex min-w-max items-center gap-0.5 sm:gap-1">
        {sections.map((item) => (
          <a key={item.id} href={`#${item.id}`} className="rounded-xl px-2.5 py-1.5 text-xs text-muted transition hover:bg-bg hover:text-text sm:px-3 sm:py-2 sm:text-sm">
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}

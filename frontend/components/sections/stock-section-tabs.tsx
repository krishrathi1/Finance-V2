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
    <div className="sticky top-[118px] z-30 overflow-auto rounded-2xl border border-border/70 bg-panel/90 p-2 md:top-[122px]">
      <div className="flex min-w-max items-center gap-1">
        {sections.map((item) => (
          <a key={item.id} href={`#${item.id}`} className="rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-bg hover:text-text">
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}

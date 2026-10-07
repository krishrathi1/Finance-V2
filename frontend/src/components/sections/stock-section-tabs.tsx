"use client";

import { useEffect, useState } from "react";
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
  const { user } = useAuth();
  const hasLocalSession = typeof window !== "undefined" && Boolean(localStorage.getItem("myfinance_auth_user"));
  const isAuthed = user || hasLocalSession;
  const sections = isAuthed ? allSections : allSections.slice(0, 1);
  const [activeId, setActiveId] = useState("overview");

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 160;
      for (let i = sections.length - 1; i >= 0; i--) {
        const el = document.getElementById(sections[i].id);
        if (el && el.offsetTop <= scrollPosition) {
          setActiveId(sections[i].id);
          break;
        }
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [sections]);

  const handleTabClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    setActiveId(id);
    const targetEl = document.getElementById(id);
    if (targetEl) {
      const yOffset = -135; // Accounts for sticky header + sticky tabs offset
      const y = targetEl.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  return (
    <div
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      className="sticky top-[88px] z-30 -mx-1 overflow-x-auto no-scrollbar scrollbar-hide rounded-2xl border border-border/80 bg-panel/95 backdrop-blur-xl p-1.5 shadow-lg sm:-mx-0 sm:top-[90px] sm:p-2 md:top-[92px]"
    >
      <div className="flex min-w-max items-center gap-1 sm:gap-1.5">
        {sections.map((item) => {
          const isActive = activeId === item.id;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(e) => handleTabClick(e, item.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 sm:px-3.5 sm:py-2 ${
                isActive
                  ? "bg-accent/15 text-accent border border-accent/40 font-bold shadow-sm"
                  : "text-muted hover:bg-accent/10 hover:text-text border border-transparent"
              }`}
            >
              {item.label}
            </a>
          );
        })}
      </div>
    </div>
  );
}

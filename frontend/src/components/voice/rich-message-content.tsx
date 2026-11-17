import React from "react";

interface RichMessageContentProps {
  content: string;
}

// Inline formatter for **bold**, *italic*, `code`, and <br>
function renderInline(text: string): React.ReactNode[] {
  if (!text) return [];

  // Split on <br> or <br/> tags to render actual HTML breaks
  if (/<br\s*\/?>/i.test(text)) {
    const segments = text.split(/<br\s*\/?>/i);
    const result: React.ReactNode[] = [];
    segments.forEach((seg, sIdx) => {
      if (sIdx > 0) {
        result.push(<br key={`br-${sIdx}`} />);
      }
      result.push(...renderInline(seg));
    });
    return result;
  }

  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
  const parts = text.split(regex);

  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return (
        <strong key={idx} className="font-semibold text-zinc-900 dark:text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
      return (
        <em key={idx} className="italic text-zinc-600 dark:text-zinc-300">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono text-[10px] text-emerald-700 dark:text-emerald-400 border border-zinc-200 dark:border-zinc-700"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

export function RichMessageContent({ content }: RichMessageContentProps) {
  if (!content) return null;

  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // ── 1. Table Detection (| col1 | col2 |) ──
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const headerCells = tableLines[0]
          .split("|")
          .map((c) => c.trim())
          .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);

        const isSeparator = /^\|[\s\-:]+(\|[\s\-:]+)+\|$/.test(tableLines[1]);
        const startRowIdx = isSeparator ? 2 : 1;

        const rows: string[][] = [];
        for (let r = startRowIdx; r < tableLines.length; r++) {
          const cells = tableLines[r]
            .split("|")
            .map((c) => c.trim())
            .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
          if (cells.length > 0) {
            rows.push(cells);
          }
        }

        elements.push(
          <div
            key={`table-${i}`}
            className="my-3 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c1017] shadow-2xs"
          >
            <table className="w-full border-collapse text-[11px] text-left">
              {headerCells.length > 0 && (
                <thead className="bg-zinc-100/90 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold tracking-wide">
                  <tr>
                    {headerCells.map((h, hIdx) => (
                      <th key={hIdx} className="px-3 py-2 whitespace-nowrap">
                        {renderInline(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {rows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className="px-3 py-2 align-top text-zinc-800 dark:text-zinc-200 leading-relaxed"
                      >
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // ── 2. Headings (#, ##, ###) ──
    if (trimmed.startsWith("#")) {
      const match = trimmed.match(/^#+/);
      const level = match ? match[0].length : 1;
      const text = trimmed.replace(/^#+\s*/, "");
      elements.push(
        <h4
          key={`h-${i}`}
          className={`font-bold text-zinc-900 dark:text-zinc-100 tracking-tight ${
            level <= 2 ? "text-xs mt-3 mb-1.5" : "text-[11px] mt-2 mb-1"
          }`}
        >
          {renderInline(text)}
        </h4>
      );
      i++;
      continue;
    }

    // Standalone bold title: **Title**
    if (/^\*\*[^*]+\*\*$/.test(trimmed)) {
      elements.push(
        <h4
          key={`bold-title-${i}`}
          className="font-bold text-xs mt-2.5 mb-1 text-zinc-900 dark:text-white"
        >
          {renderInline(trimmed)}
        </h4>
      );
      i++;
      continue;
    }

    // ── 3. Blockquotes (> quote) ──
    if (trimmed.startsWith(">")) {
      const quoteText = trimmed.replace(/^>\s*/, "");
      elements.push(
        <blockquote
          key={`quote-${i}`}
          className="my-2 border-l-2 border-emerald-500 pl-3 text-[11px] italic text-zinc-700 dark:text-zinc-300 bg-emerald-500/5 py-1.5 rounded-r-lg"
        >
          {renderInline(quoteText)}
        </blockquote>
      );
      i++;
      continue;
    }

    // ── 4. Bullet lists (- item, * item, • item) ──
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ")) {
      const itemText = trimmed.replace(/^[-*•]\s+/, "");
      elements.push(
        <div key={`bullet-${i}`} className="flex items-start gap-2 my-1 ml-0.5 text-xs">
          <span className="text-emerald-600 dark:text-emerald-400 mt-1 shrink-0 text-[10px] leading-none">•</span>
          <span className="text-zinc-800 dark:text-zinc-200 leading-relaxed">
            {renderInline(itemText)}
          </span>
        </div>
      );
      i++;
      continue;
    }

    // ── 5. Numbered lists (1. item, 2. item) ──
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      elements.push(
        <div key={`num-${i}`} className="flex items-start gap-2 my-1 ml-0.5 text-xs">
          <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0 text-[10px] min-w-3.5">
            {numMatch[1]}.
          </span>
          <span className="text-zinc-800 dark:text-zinc-200 leading-relaxed">
            {renderInline(numMatch[2])}
          </span>
        </div>
      );
      i++;
      continue;
    }

    // ── 6. Horizontal separator (---) ──
    if (/^---+$/.test(trimmed)) {
      elements.push(
        <hr key={`hr-${i}`} className="my-2.5 border-zinc-200 dark:border-white/10" />
      );
      i++;
      continue;
    }

    // ── 7. Regular paragraph / empty line ──
    if (trimmed === "") {
      elements.push(<div key={`empty-${i}`} className="h-1.5" />);
    } else {
      elements.push(
        <p key={`p-${i}`} className="my-1 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
          {renderInline(rawLine)}
        </p>
      );
    }

    i++;
  }

  return <div className="space-y-0.5">{elements}</div>;
}

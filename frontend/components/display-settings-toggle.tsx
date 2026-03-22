"use client";

import { Accessibility, PanelsTopLeft } from "lucide-react";

import { useDisplaySettings } from "@/components/display-settings-provider";
import { cn } from "@/lib/utils";

const pillBaseClassName =
  "inline-flex h-9 items-center gap-2 rounded-full border border-border/50 bg-bg/75 px-3 text-xs font-semibold text-muted backdrop-blur transition hover:border-accent/40 hover:text-text active:scale-[0.98]";

export function DisplaySettingsToggle() {
  const { density, colorVision, toggleDensity, toggleColorVision } = useDisplaySettings();

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggleDensity}
        aria-label={`Switch to ${density === "compact" ? "comfortable" : "compact"} density`}
        className={cn(
          pillBaseClassName,
          density === "compact" && "border-accent/40 bg-accent/10 text-accent"
        )}
      >
        <PanelsTopLeft className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">{density === "compact" ? "Compact View" : "Comfortable View"}</span>
        <span className="lg:hidden">{density === "compact" ? "Dense" : "Roomy"}</span>
      </button>

      <button
        type="button"
        onClick={toggleColorVision}
        aria-label={`Switch to ${colorVision === "accessible" ? "standard" : "accessible"} market colors`}
        className={cn(
          pillBaseClassName,
          colorVision === "accessible" && "border-accent/40 bg-accent/10 text-accent"
        )}
      >
        <Accessibility className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">
          {colorVision === "accessible" ? "Colorblind Mode" : "Standard Colors"}
        </span>
        <span className="lg:hidden">{colorVision === "accessible" ? "Safe" : "Color"}</span>
      </button>
    </div>
  );
}

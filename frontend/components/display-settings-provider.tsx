"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type DensityMode = "comfortable" | "compact";
type ColorVisionMode = "standard" | "accessible";

type DisplaySettingsContextValue = {
  density: DensityMode;
  colorVision: ColorVisionMode;
  setDensity: (value: DensityMode) => void;
  setColorVision: (value: ColorVisionMode) => void;
  toggleDensity: () => void;
  toggleColorVision: () => void;
};

const DENSITY_KEY = "svai-density";
const COLOR_VISION_KEY = "svai-color-vision";

const DisplaySettingsContext = createContext<DisplaySettingsContextValue | null>(null);

export function DisplaySettingsProvider({ children }: { children: ReactNode }) {
  const [density, setDensity] = useState<DensityMode>("comfortable");
  const [colorVision, setColorVision] = useState<ColorVisionMode>("standard");

  useEffect(() => {
    const savedDensity = window.localStorage.getItem(DENSITY_KEY);
    const savedColorVision = window.localStorage.getItem(COLOR_VISION_KEY);

    if (savedDensity === "comfortable" || savedDensity === "compact") {
      setDensity(savedDensity);
    }

    if (savedColorVision === "standard" || savedColorVision === "accessible") {
      setColorVision(savedColorVision);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.density = density;
    window.localStorage.setItem(DENSITY_KEY, density);
  }, [density]);

  useEffect(() => {
    document.documentElement.dataset.colorVision = colorVision;
    window.localStorage.setItem(COLOR_VISION_KEY, colorVision);
  }, [colorVision]);

  const value = useMemo<DisplaySettingsContextValue>(
    () => ({
      density,
      colorVision,
      setDensity,
      setColorVision,
      toggleDensity: () => setDensity((current) => (current === "compact" ? "comfortable" : "compact")),
      toggleColorVision: () =>
        setColorVision((current) => (current === "accessible" ? "standard" : "accessible")),
    }),
    [density, colorVision]
  );

  return <DisplaySettingsContext.Provider value={value}>{children}</DisplaySettingsContext.Provider>;
}

export function useDisplaySettings() {
  const context = useContext(DisplaySettingsContext);

  if (!context) {
    throw new Error("useDisplaySettings must be used within DisplaySettingsProvider");
  }

  return context;
}

import { createContext, useCallback, useLayoutEffect, useMemo, useState } from "react";

import { paletteStyle } from "../config/brand.js";
import { useAppConfig } from "../hooks/useAppConfig.js";

const STORAGE_KEY = "gym_theme";

function getInitialTheme() {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);
  const { branding } = useAppConfig();
  const colors = branding[`${theme}_colors`];
  const declarations = Object.entries(paletteStyle(colors))
    .map(([property, color]) => `${property}:${color}`)
    .join(";");

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.scheme = branding.scheme;
    window.localStorage.setItem(STORAGE_KEY, theme);

    // Keeps the mobile browser's chrome (status bar area) matching the
    // theme — a small touch that matters more on a phone than on desktop.
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = getComputedStyle(root).getPropertyValue("--gym-canvas").trim();
  }, [theme, branding.scheme, declarations]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {declarations && <style media="screen">{`:root { ${declarations} }`}</style>}
      {children}
    </ThemeContext.Provider>
  );
}

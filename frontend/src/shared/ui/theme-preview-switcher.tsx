"use client";

import { useEffect, useState } from "react";

// TEMPORARY preview tool: lets the user pick a palette + mode. Remove once a theme is chosen.
const PALETTES = ["ivory", "marble", "paper"] as const;
type Palette = (typeof PALETTES)[number];

export function ThemePreviewSwitcher() {
  const [palette, setPalette] = useState<Palette>("ivory");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const el = document.documentElement;
    setPalette((el.getAttribute("data-theme") as Palette) || "ivory");
    setDark(el.classList.contains("dark"));
  }, []);

  const applyPalette = (p: Palette) => {
    document.documentElement.setAttribute("data-theme", p);
    try {
      localStorage.setItem("arkenia:palette", p);
    } catch {}
    setPalette(p);
  };

  const applyDark = (d: boolean) => {
    document.documentElement.classList.toggle("dark", d);
    try {
      localStorage.setItem("arkenia:theme", d ? "dark" : "light");
    } catch {}
    setDark(d);
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 rounded-lg border border-line bg-surface p-3"
      role="group"
      aria-label="Theme preview"
    >
      <span className="t-overline">Preview theme</span>
      <div className="flex gap-1">
        {PALETTES.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => applyPalette(p)}
            aria-pressed={palette === p}
            className={`rounded border px-2.5 py-1 font-mono text-2xs uppercase tracking-wide transition-colors ${
              palette === p
                ? "border-accent bg-accent text-accent-on"
                : "border-line text-ink-muted hover:text-ink"
            }`}
          >
            {p}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => applyDark(!dark)}
        className="rounded border border-line px-2.5 py-1 text-left font-mono text-2xs uppercase tracking-wide text-ink-muted transition-colors hover:text-ink"
      >
        {dark ? "● dark" : "○ light"}
      </button>
    </div>
  );
}

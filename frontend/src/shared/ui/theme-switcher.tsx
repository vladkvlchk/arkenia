"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";

type Mode = "light" | "dark" | "system";
const KEY = "arkenia:theme";

function applyMode(mode: Mode) {
  const dark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

const OPTIONS: ReadonlyArray<[Mode, typeof Sun, string]> = [
  ["light", Sun, "Light"],
  ["dark", Moon, "Dark"],
  ["system", Monitor, "System"],
];

/** Light / Dark / System theme control. The pre-paint class is set by the script in layout.tsx. */
export function ThemeSwitcher() {
  const [mode, setMode] = useState<Mode>("system");

  useEffect(() => {
    setMode(((localStorage.getItem(KEY) as Mode) || "system"));
  }, []);

  useEffect(() => {
    applyMode(mode);
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyMode("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  function choose(m: Mode) {
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* private mode — just won't persist */
    }
    setMode(m);
  }

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border border-line p-0.5"
      role="group"
      aria-label="Color theme"
    >
      {OPTIONS.map(([m, Icon, label]) => (
        <button
          key={m}
          type="button"
          onClick={() => choose(m)}
          aria-pressed={mode === m}
          title={label}
          className={`inline-flex h-7 items-center gap-1.5 rounded px-2 font-mono text-2xs uppercase tracking-wide transition-colors ${
            mode === m ? "bg-accent text-accent-on" : "text-ink-muted hover:text-ink"
          }`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

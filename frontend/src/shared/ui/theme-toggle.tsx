"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "./button";

const STORAGE_KEY = "arkenia:theme";

/** Class-based dark mode; the initial class is set by the inline script in layout.tsx. */
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const dark = !root.classList.contains("dark");
    root.classList.toggle("dark", dark);
    try {
      localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
    } catch {
      /* private mode — theme just won't persist */
    }
  }

  return (
    <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="Toggle color theme">
      <Sun className="h-4 w-4 dark:hidden" aria-hidden />
      <Moon className="hidden h-4 w-4 dark:block" aria-hidden />
    </Button>
  );
}

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes; later classes win on conflicts (safe `className` overrides). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

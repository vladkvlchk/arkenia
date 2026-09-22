import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Unmount everything between tests: a leaked DOM makes getByRole find the
// *previous* test's element and turns real failures into confusing ones.
afterEach(cleanup);

/**
 * jsdom implements neither of the browser APIs below. Both are reached by
 * components the app already ships, so without these stubs the failures appear
 * as unrelated TypeErrors — and Vitest reports them as unhandled errors that
 * can mask a genuine assertion failure elsewhere in the run.
 */

// Pointer Capture — Radix Toast calls it while setting up swipe-to-dismiss.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

// ResizeObserver — the ledger grid re-renders its canvas on container resize.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// IntersectionObserver — the ledger grid defers its reveal until it scrolls in.
if (!globalThis.IntersectionObserver) {
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds = [];
  } as unknown as typeof IntersectionObserver;
}

// Object URLs — the create form previews a chosen cover before uploading it.
if (!URL.createObjectURL) {
  URL.createObjectURL = () => "blob:preview";
  URL.revokeObjectURL = () => {};
}

// matchMedia — the theme controls read the OS colour-scheme preference.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList;
}

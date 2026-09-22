"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { fmtNum } from "@/shared/lib/format";
import { TOKEN_SYMBOL } from "@/shared/config";

/**
 * LedgerGrid — raised capital rendered as physical grain: one inked square per
 * `unit` of deposits. The unit anchors at 100 and the square size steps down as
 * the campaign grows (chunky tokens → fine sediment at 100k+); when even the
 * finest grain cannot fit the band, the unit escalates ×10 and the legend says
 * so. Returned capital is "un-inked": hollow squares (half-tone at fine sizes)
 * from the start of the grid — first in, first paid back. Unwritten paper is a
 * quiet dot lattice, so a young campaign reads as an honest, mostly-blank page.
 *
 * Canvas-based: ten thousand cells are one paint pass, and hover resolves by
 * arithmetic instead of ten thousand DOM nodes.
 */

const BASE_UNIT = 100;

/** Grain steps, coarse → fine. The largest square that fits the band wins. */
const GRAIN = [
  { cell: 20, gap: 3 },
  { cell: 14, gap: 2 },
  { cell: 10, gap: 2 },
  { cell: 7, gap: 2 },
  { cell: 5, gap: 1 },
  { cell: 3, gap: 1 },
  { cell: 2, gap: 1 },
] as const;

interface GridLayout {
  unit: number;
  cells: number;
  returnedCells: number;
  cols: number;
  rows: number;
  cell: number;
  gap: number;
}

/**
 * Exported for its own tests. The grid draws to a canvas, so this arithmetic
 * has no rendered surface to assert against — and it decides both whether the
 * band renders at all and what unit the legend claims each square is worth.
 */
export function computeLayout(
  width: number,
  height: number,
  raised: number,
  returned: number
): GridLayout | null {
  if (width < 8 || height < 8) return null;
  for (let mult = 1; mult <= 100_000; mult *= 10) {
    const unit = BASE_UNIT * mult;
    const cells = Math.ceil(raised / unit);
    for (const g of GRAIN) {
      const cols = Math.floor((width + g.gap) / (g.cell + g.gap));
      const rows = Math.floor((height + g.gap) / (g.cell + g.gap));
      if (cols < 1 || rows < 1) continue;
      if (cols * rows >= cells) {
        return {
          unit,
          cells,
          returnedCells: Math.min(cells, Math.ceil(returned / unit)),
          cols,
          rows,
          cell: g.cell,
          gap: g.gap,
        };
      }
    }
  }
  return null;
}

export interface LedgerGridProps {
  /** Lifetime deposits, in display token units. */
  raised: number;
  /** Amount returned to cohorts; rendered as hollow squares from the start of the grid. */
  returned?: number;
  /** Band height in px. */
  height?: number;
  className?: string;
}

export function LedgerGrid({ raised, returned = 0, height = 72, className }: LedgerGridProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const layoutRef = useRef<GridLayout | null>(null);
  const widthRef = useRef(0);
  /** Print-in reveal 0→1; sticks at 1 after the first play. */
  const progressRef = useRef(0);
  const hoverRef = useRef<{ x: number; y: number; idx: number | null } | null>(null);
  const rafRef = useRef(0);
  const rafPending = useRef(false);

  const [unit, setUnit] = useState(BASE_UNIT);
  const [hovering, setHovering] = useState(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const layout = layoutRef.current;
    if (!canvas || !layout) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = widthRef.current;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
    if (canvas.height !== Math.round(height * dpr)) canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Colors resolve from the CSS vars at paint time, so theme flips just repaint.
    const vars = getComputedStyle(canvas);
    const ink = vars.getPropertyValue("--ink").trim();
    const lineStrong = vars.getPropertyValue("--line-strong").trim();

    const { cells, returnedCells, cols, rows, cell, gap } = layout;
    const pitch = cell + gap;
    const visible = cells * progressRef.current;
    const hover = hoverRef.current;
    const hollow = cell >= 7; // below this, a 1px stroke has no interior — use half-tone
    const dot = cell >= 10 ? 2 : 1;
    const inset = (cell - dot) / 2;

    for (let i = 0; i < cols * rows; i++) {
      const x = (i % cols) * pitch;
      const y = Math.floor(i / cols) * pitch;

      if (i < visible) {
        const a = Math.min(1, visible - i); // soft leading edge while printing
        if (i < returnedCells) {
          if (hollow) {
            ctx.strokeStyle = `hsl(${ink} / ${0.55 * a})`;
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
          } else {
            ctx.fillStyle = `hsl(${ink} / ${0.3 * a})`;
            ctx.fillRect(x, y, cell, cell);
          }
        } else {
          ctx.fillStyle = `hsl(${ink} / ${0.92 * a})`;
          ctx.fillRect(x, y, cell, cell);
        }
      } else {
        // Unwritten paper: dot lattice, waking slightly near the pointer.
        let lift = 0;
        if (hover) {
          const d = Math.hypot(hover.x - (x + cell / 2), hover.y - (y + cell / 2));
          if (d < 40) lift = 1 - d / 40;
        }
        ctx.fillStyle = `hsl(${lineStrong} / ${0.5 + 0.5 * lift})`;
        ctx.fillRect(x + inset, y + inset, dot, dot);
      }
    }

    if (hover?.idx != null) {
      const x = (hover.idx % cols) * pitch;
      const y = Math.floor(hover.idx / cols) * pitch;
      ctx.strokeStyle = `hsl(${ink})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 1.5, y - 1.5, cell + 3, cell + 3);
    }
  }, [height]);

  const relayout = useCallback(() => {
    widthRef.current = wrapRef.current?.clientWidth ?? 0;
    const next = computeLayout(widthRef.current, height, raised, returned);
    layoutRef.current = next;
    if (next) setUnit(next.unit);
    draw();
  }, [raised, returned, height, draw]);

  useEffect(() => {
    relayout();
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(relayout);
    ro.observe(el);
    return () => ro.disconnect();
  }, [relayout]);

  // Theme toggles mutate <html> class / data-theme — repaint with the new ink.
  useEffect(() => {
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    return () => mo.disconnect();
  }, [draw]);

  // Print the grid in reading order the first time it scrolls into view.
  useEffect(() => {
    if (progressRef.current >= 1) return;
    const el = wrapRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        if (reduced) {
          progressRef.current = 1;
          draw();
          return;
        }
        const t0 = performance.now();
        const duration = 1100;
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / duration);
          progressRef.current = 1 - Math.pow(1 - p, 3);
          draw();
          if (p < 1) rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      },
      { threshold: 0.2 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  const scheduleDraw = () => {
    if (rafPending.current) return;
    rafPending.current = true;
    requestAnimationFrame(() => {
      rafPending.current = false;
      draw();
    });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const layout = layoutRef.current;
    const canvas = canvasRef.current;
    if (!layout || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { cols, rows, cell, gap, cells } = layout;
    const pitch = cell + gap;
    const col = Math.floor(x / pitch);
    const row = Math.floor(y / pitch);
    const inCell =
      col >= 0 && col < cols && row >= 0 && row < rows &&
      x - col * pitch <= cell && y - row * pitch <= cell;
    const idx = inCell ? row * cols + col : -1;
    const filled = idx >= 0 && idx < cells;

    hoverRef.current = { x, y, idx: filled ? idx : null };
    setHovering(filled);

    if (filled && tipRef.current) {
      const tip = tipRef.current;
      const left = Math.max(4, Math.min(x + 14, widthRef.current - tip.offsetWidth - 4));
      const above = y - tip.offsetHeight - 12;
      tip.style.left = `${left}px`;
      tip.style.top = `${above < 2 ? y + 16 : above}px`;
    }
    scheduleDraw();
  };

  const onPointerLeave = () => {
    hoverRef.current = null;
    setHovering(false);
    scheduleDraw();
  };

  const label =
    `Raised ${fmtNum(raised)} ${TOKEN_SYMBOL}` +
    (returned > 0 ? `, returned ${fmtNum(returned)} ${TOKEN_SYMBOL}` : "") +
    `. One square represents ${fmtNum(unit)} ${TOKEN_SYMBOL}.`;

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        style={{ width: "100%", height }}
        className="block cursor-crosshair"
        onPointerMove={onPointerMove}
        onPointerDown={onPointerMove}
        onPointerLeave={onPointerLeave}
      />

      {/* Cursor tooltip — totals only; squares are grain, not individual deposits. */}
      <div
        ref={tipRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute z-10 min-w-[150px] rounded-md border border-line bg-surface px-3 py-2 transition-opacity duration-100",
          hovering ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="flex items-baseline justify-between gap-4">
          <span className="t-overline">Raised</span>
          <span className="font-mono text-xs text-ink">{fmtNum(raised)}</span>
        </div>
        {returned > 0 && (
          <div className="mt-1 flex items-baseline justify-between gap-4">
            <span className="t-overline">Returned</span>
            <span className="font-mono text-xs text-ink">{fmtNum(returned)}</span>
          </div>
        )}
        <div className="mt-1.5 border-t border-line pt-1.5 font-mono text-2xs text-ink-subtle">
          1 sq = {fmtNum(unit)} {TOKEN_SYMBOL}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 font-mono text-2xs text-ink-subtle">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 bg-ink/90" />
          <span>= {fmtNum(unit)} {TOKEN_SYMBOL}</span>
        </span>
        {returned > 0 && (
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 border border-ink/60" />
            <span>returned</span>
          </span>
        )}
      </div>
    </div>
  );
}

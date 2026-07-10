"use client";

import { createContext, useCallback, useContext, useState } from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { AlertTriangle, CheckCircle2, ExternalLink, Info, X } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { truncateAddress } from "@/shared/lib/format";
import { explorerTxUrl } from "@/shared/config";

type ToastIntent = "default" | "success" | "danger" | "info";

export interface ToastOptions {
  title: string;
  description?: string;
  intent?: ToastIntent;
  /** When present, renders a "View transaction" explorer link — the honest receipt. */
  txHash?: string;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const ToastContext = createContext<{ toast: (opts: ToastOptions) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const intentIcon: Record<ToastIntent, React.ReactNode> = {
  default: null,
  success: <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />,
  danger: <AlertTriangle className="h-4 w-4 text-danger" aria-hidden />,
  info: <Info className="h-4 w-4 text-info" aria-hidden />,
};

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((opts: ToastOptions) => {
    setToasts((prev) => [...prev.slice(-4), { ...opts, id: nextId++ }]);
  }, []);

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
        {children}
        {toasts.map((t) => (
          <ToastPrimitive.Root
            key={t.id}
            onOpenChange={(open) => !open && dismiss(t.id)}
            className={cn(
              "pointer-events-auto relative flex gap-3 rounded-lg border border-line bg-surface p-4 pr-10 shadow-md",
              "data-[state=open]:animate-toast-in data-[state=closed]:animate-toast-out",
              "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=end]:animate-toast-out"
            )}
          >
            {intentIcon[t.intent ?? "default"] && (
              <span className="mt-0.5 shrink-0">{intentIcon[t.intent ?? "default"]}</span>
            )}
            <div className="min-w-0">
              <ToastPrimitive.Title className="text-sm font-medium text-ink">
                {t.title}
              </ToastPrimitive.Title>
              {t.description && (
                <ToastPrimitive.Description className="mt-0.5 text-[13px] leading-5 text-ink-muted">
                  {t.description}
                </ToastPrimitive.Description>
              )}
              {t.txHash && (
                <a
                  href={explorerTxUrl(t.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 font-mono text-xs text-accent hover:text-accent-hover"
                >
                  {truncateAddress(t.txHash, 6)}
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              )}
            </div>
            <ToastPrimitive.Close
              aria-label="Dismiss"
              className="absolute right-2.5 top-2.5 rounded-sm p-1 text-ink-faint transition-colors duration-150 hover:text-ink"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[60] flex w-[380px] max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

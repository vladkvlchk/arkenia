"use client";

import { createContext, forwardRef, useContext } from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/shared/lib/cn";

type TabsVariant = "underline" | "segmented";

const VariantContext = createContext<TabsVariant>("underline");

export const Tabs = TabsPrimitive.Root;

interface TabsListProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  /** "underline" for page-level sections, "segmented" for compact switches. */
  variant?: TabsVariant;
}

export const TabsList = forwardRef<React.ElementRef<typeof TabsPrimitive.List>, TabsListProps>(
  ({ className, variant = "underline", ...props }, ref) => (
    <VariantContext.Provider value={variant}>
      <TabsPrimitive.List
        ref={ref}
        className={cn(
          variant === "underline" && "flex gap-5 border-b border-line",
          variant === "segmented" &&
            "inline-flex items-center gap-0.5 rounded-md border border-line bg-surface-2 p-0.5",
          className
        )}
        {...props}
      />
    </VariantContext.Provider>
  )
);
TabsList.displayName = "TabsList";

export const TabsTrigger = forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const variant = useContext(VariantContext);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "transition-colors duration-150",
        variant === "underline" &&
          "-mb-px border-b-2 border-transparent pb-2.5 text-sm font-medium text-ink-muted hover:text-ink data-[state=active]:border-ink data-[state=active]:text-ink",
        variant === "segmented" &&
          "h-8 rounded-[6px] px-3 text-[13px] font-medium text-ink-muted hover:text-ink data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-xs",
        className
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("focus-visible:outline-none data-[state=active]:animate-fade-in", className)}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";

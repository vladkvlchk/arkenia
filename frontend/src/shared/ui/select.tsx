"use client";

import { forwardRef } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/shared/lib/cn";

/**
 * Select — a listbox the design system can actually style.
 *
 * A native `<select>` renders its options with the operating system, so the menu ignores every
 * token in here: it arrives in the OS font at the OS size with the OS highlight colour, and looks
 * like a different product on every machine. Radix keeps the roles, keyboard behaviour and
 * typeahead a native select gives for free while letting the popup be ours.
 *
 * Per DESIGN.md the popup is *hairline framed*, not floated — 1px hairline on `{color.surface}`.
 * No shadow: "no drop shadows, no glows, no gradients — anywhere."
 */
export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-transparent px-2",
      "text-[13px] font-medium text-ink transition-colors duration-150",
      "hover:border-line focus:border-line-strong focus:outline-none",
      "data-[state=open]:border-line-strong",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-hidden />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = "SelectTrigger";

export const SelectContent = forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      sideOffset={4}
      className={cn(
        "z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md",
        "border border-line bg-surface p-1 animate-fade-in",
        className
      )}
      {...props}
    >
      <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = "SelectContent";

export const SelectItem = forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center gap-2 rounded-[6px] py-1.5 pl-2 pr-7",
      "text-[13px] text-ink-muted outline-none transition-colors duration-150",
      // Tonal lift for the pointer/keyboard cursor — the design system's only elevation cue.
      "data-[highlighted]:bg-surface-2 data-[highlighted]:text-ink",
      "data-[state=checked]:font-medium data-[state=checked]:text-ink",
      className
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    {/* Right-aligned tick: the checked row is also bolded, so this is confirmation, not the
        only signal — colour and weight alone would not survive a monochrome print. */}
    <SelectPrimitive.ItemIndicator className="absolute right-2 flex items-center">
      <Check className="h-3.5 w-3.5" aria-hidden />
    </SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>
));
SelectItem.displayName = "SelectItem";

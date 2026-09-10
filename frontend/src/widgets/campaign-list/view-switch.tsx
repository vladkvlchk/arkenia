"use client";

import { LayoutGrid, Rows3 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui";

export type CampaignView = "cards" | "table";

const VIEWS: { value: CampaignView; label: string; icon: typeof LayoutGrid }[] = [
  { value: "cards", label: "Cards", icon: LayoutGrid },
  { value: "table", label: "Table", icon: Rows3 },
];

/**
 * Cards ↔ table toggle. Icon-only: the toolbar already carries a search field, four filter tabs
 * and a sort control, and two more words of chrome crowd it — the grid and rows glyphs are a
 * strong enough convention to carry it alone.
 *
 * The label survives as `sr-only`, so the control still has an accessible name; an icon-only
 * button with no text is announced as nothing at all. `title` gives sighted users the same word
 * on hover.
 */
export function ViewSwitch({
  value,
  onChange,
}: {
  value: CampaignView;
  onChange: (v: CampaignView) => void;
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as CampaignView)}>
      <TabsList variant="segmented" aria-label="List view">
        {VIEWS.map((v) => (
          <TabsTrigger
            key={v.value}
            value={v.value}
            title={v.label}
            // Square, and centred: the segmented trigger is not a flex container, so an icon
            // alone would sit inline against the text baseline rather than in the middle.
            className="flex w-9 items-center justify-center px-0"
          >
            <v.icon className="h-4 w-4" aria-hidden />
            <span className="sr-only">{v.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

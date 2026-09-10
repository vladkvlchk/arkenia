"use client";

import { LayoutGrid, Rows3 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui";

export type CampaignView = "cards" | "table";

const VIEWS: { value: CampaignView; label: string; icon: typeof LayoutGrid }[] = [
  { value: "cards", label: "Cards", icon: LayoutGrid },
  { value: "table", label: "Table", icon: Rows3 },
];

/**
 * Cards ↔ table toggle. A real toggle group rather than two icon buttons, so the current view is
 * announced and both options are reachable by keyboard; the labels stay visible above sm because
 * two abstract glyphs are not self-explanatory.
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
          <TabsTrigger key={v.value} value={v.value}>
            <v.icon className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only sm:not-sr-only">{v.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

import { Badge } from "@/shared/ui";
import type { CampaignStatus } from "../types";

const statusConfig: Record<CampaignStatus, { label: string; variant: "success" | "info" | "neutral" }> = {
  open: { label: "Open", variant: "success" },
  returning: { label: "Returning", variant: "info" },
  closed: { label: "Closed", variant: "neutral" },
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const { label, variant } = statusConfig[status];
  return (
    <Badge variant={variant} dot>
      {label}
    </Badge>
  );
}

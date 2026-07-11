"use client";

import { ListOrdered, X } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@/shared/ui";
import { fmtDate, fmtNum } from "@/shared/lib/format";
import { TOKEN_SYMBOL } from "@/shared/config";
import type { OpenOrder } from "@/entities/market";

interface OpenOrdersProps {
  orders: OpenOrder[];
  showMarket?: boolean;
  /** When set, rows get a cancel action (an on-chain tx — wired by the parent). */
  onCancel?: (order: OpenOrder) => void;
  /** Order id currently being cancelled (spinner state). */
  cancellingId?: string | null;
}

/** The viewer's resting orders, with partial-fill progress and one-click cancel. */
export function OpenOrders({ orders, showMarket = false, onCancel, cancellingId }: OpenOrdersProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your open orders</CardTitle>
        <span className="t-overline">{orders.length} resting</span>
      </CardHeader>
      {orders.length === 0 ? (
        <EmptyState
          icon={ListOrdered}
          title="No open orders"
          description="Orders you place rest here until they fill or you cancel them."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <Tr className="hover:bg-transparent">
                {showMarket && <Th>Market</Th>}
                <Th>Cohort</Th>
                <Th>Side</Th>
                <Th numeric>Price</Th>
                <Th numeric>Filled / size</Th>
                <Th>Placed</Th>
                {onCancel && <Th aria-label="Cancel" />}
              </Tr>
            </THead>
            <TBody>
              {orders.map((o) => (
                <Tr key={o.id}>
                  {showMarket && <Td className="font-medium text-ink">{o.campaignName}</Td>}
                  <Td className="font-medium text-ink">#{o.cohortIndex}</Td>
                  <Td>
                    <Badge variant={o.side === "bid" ? "success" : "danger"}>
                      {o.side === "bid" ? "Bid" : "Ask"}
                    </Badge>
                  </Td>
                  <Td numeric>
                    {o.price.toFixed(3)} <span className="text-ink-subtle">{TOKEN_SYMBOL}</span>
                  </Td>
                  <Td numeric className="text-ink-muted">
                    <span className={o.filled > 0 ? "text-ink" : undefined}>{fmtNum(o.filled)}</span>
                    {" / "}
                    {fmtNum(o.size)}
                  </Td>
                  <Td className="text-ink-muted">{fmtDate(o.placedAt)}</Td>
                  {onCancel && (
                    <Td numeric className="py-2">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Cancel ${o.side} on cohort ${o.cohortIndex}`}
                        loading={cancellingId === o.id}
                        onClick={() => onCancel(o)}
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </Button>
                    </Td>
                  )}
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

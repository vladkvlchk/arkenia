"use client";

import { useState } from "react";
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
  useToast,
} from "@/shared/ui";
import { fmtDate, fmtNum } from "@/shared/lib/format";
import { TOKEN_SYMBOL } from "@/shared/config";
import type { OpenOrder } from "@/entities/market";

/** The viewer's resting orders, with partial-fill progress and one-click cancel. */
export function OpenOrders({ orders: initial, showMarket = false }: { orders: OpenOrder[]; showMarket?: boolean }) {
  const { toast } = useToast();
  const [orders, setOrders] = useState(initial);

  function cancel(order: OpenOrder) {
    // TODO(onchain): wire premarket cancelOrder(orderId).
    setOrders((prev) => prev.filter((o) => o.id !== order.id));
    toast({
      title: "Order cancelled",
      description: `${order.side === "bid" ? "Bid" : "Ask"} for ${fmtNum(order.size - order.filled)} shares of Cohort #${order.cohortIndex} withdrawn.`,
      txHash: "0x5a1c9e4b6d0a3f7c3e8b5d1a9f4c6e0b3d7a7d3f2a8c5e1b9d4f6a0c3e7b2d8f",
    });
  }

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
                <Th aria-label="Cancel" />
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
                  <Td numeric className="py-2">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Cancel ${o.side} on cohort ${o.cohortIndex}`}
                      onClick={() => cancel(o)}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </Button>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

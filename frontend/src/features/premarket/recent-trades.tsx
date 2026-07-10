import { Card, CardHeader, CardTitle, Table, TBody, Td, Th, THead, Tr } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import { fmtDateTime, fmtNum } from "@/shared/lib/format";
import { TOKEN_SYMBOL } from "@/shared/config";
import type { MarketTrade } from "@/entities/market";

export function RecentTrades({ trades }: { trades: MarketTrade[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent trades</CardTitle>
        <span className="t-overline">{TOKEN_SYMBOL} / share</span>
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <THead>
            <Tr className="hover:bg-transparent">
              <Th>Time</Th>
              <Th numeric>Price</Th>
              <Th numeric>Size</Th>
            </Tr>
          </THead>
          <TBody>
            {trades.map((t) => (
              <Tr key={t.id}>
                <Td className="text-ink-muted">{fmtDateTime(t.at)}</Td>
                <Td numeric className={cn("font-medium", t.side === "bid" ? "text-success" : "text-danger")}>
                  {t.price.toFixed(3)}
                </Td>
                <Td numeric className="text-ink-muted">{fmtNum(t.size)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
    </Card>
  );
}

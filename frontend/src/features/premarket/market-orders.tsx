"use client";

import { useState } from "react";
import { maxUint256, parseUnits } from "viem";
import { usePublicClient } from "wagmi";
import { Layers } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  NumberInput,
  Table,
  TBody,
  Td,
  Th,
  THead,
  TokenAmount,
  Tr,
  useToast,
} from "@/shared/ui";
import { useWallet } from "@/shared/lib/mock-wallet";
import { fmtNum } from "@/shared/lib/format";
import { TOKEN_SYMBOL } from "@/shared/config";
import type { ApiOrder } from "@/lib/api/client";
import { usePremarket, type Order } from "@/lib/hooks/premarket";
import { useToken, useTokenActions } from "@/lib/hooks/campaign";

type Addr = `0x${string}`;

interface MarketOrdersProps {
  campaign: Addr;
  /** Other makers' live orders for the selected cohort. */
  orders: ApiOrder[];
  /** Viewer's shares in this cohort — the ceiling when taking a bid. */
  yourShares: number;
  /** Called after a confirmed fill so the parent can mask indexer lag. */
  onFilled: (orderId: string, shares: number) => void;
}

/**
 * The fillable side of the book: every resting order is a signed intent anyone
 * can settle on-chain via fillOrder — partially or in full. Taking an ask pays
 * the maker USDC (allowance preflight); taking a bid hands over cohort shares.
 */
export function MarketOrders({ campaign, orders, yourShares, onFilled }: MarketOrdersProps) {
  const wallet = useWallet();
  const { toast } = useToast();
  const publicClient = usePublicClient();
  const premarket = usePremarket(campaign);
  const { approve } = useTokenActions();
  const { allowance } = useToken(wallet.address as Addr | undefined, campaign);

  const [target, setTarget] = useState<ApiOrder | null>(null);
  const [amount, setAmount] = useState("");
  const [filling, setFilling] = useState(false);
  const [step, setStep] = useState<string | null>(null);

  const connected = wallet.status === "connected";
  const parsed = parseFloat(amount) || 0;
  const takingAsk = target?.side === "ask"; // you buy shares, pay USDC
  const cap = target ? (takingAsk ? target.remaining : Math.min(target.remaining, yourShares)) : 0;
  const cost = target ? parsed * target.price : 0;

  const amountError =
    target && parsed > cap
      ? takingAsk
        ? `Only ${fmtNum(target.remaining)} shares remain in this order`
        : `You can sell at most ${fmtNum(cap)} shares`
      : undefined;
  const valid = connected && target !== null && parsed > 0 && !amountError;

  function open(order: ApiOrder) {
    setTarget(order);
    setAmount("");
  }

  async function fill() {
    if (!valid || !target) return;
    setFilling(true);
    try {
      const fillShares = parseUnits(parsed.toFixed(6), 6);
      if (takingAsk) {
        // Paying the maker in USDC — make sure the contract can pull it from you.
        const needed = parseUnits((cost * 1.001).toFixed(6), 6); // headroom for ceil rounding
        if (allowance < needed) {
          setStep(`Approving ${TOKEN_SYMBOL}…`);
          const hash = await approve(campaign, maxUint256);
          await publicClient?.waitForTransactionReceipt({ hash });
        }
      }

      setStep("Filling on-chain…");
      const o = target.fill.order;
      const struct: Order = {
        maker: o.maker,
        isSell: o.isSell,
        cohortId: BigInt(o.cohortId),
        shareAmount: BigInt(o.shareAmount),
        usdcAmount: BigInt(o.usdcAmount),
        nonce: BigInt(o.nonce),
        deadline: BigInt(o.deadline),
      };
      const txHash = await premarket.fillOrder(struct, target.fill.signature, fillShares);
      await publicClient?.waitForTransactionReceipt({ hash: txHash });

      onFilled(target.id, parsed);
      setTarget(null);
      toast({
        title: takingAsk ? "Shares bought" : "Shares sold",
        description: `${fmtNum(parsed)} shares of Cohort #${target.cohortIndex} at ${target.price.toFixed(3)} ${TOKEN_SYMBOL}.`,
        intent: "success",
        txHash,
      });
    } catch (e) {
      toast({
        title: "Fill failed",
        description:
          (e as { shortMessage?: string }).shortMessage ??
          (e instanceof Error ? e.message : "The transaction was rejected."),
        intent: "danger",
      });
    } finally {
      setFilling(false);
      setStep(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resting orders</CardTitle>
        <span className="t-overline">{orders.length} fillable</span>
      </CardHeader>
      {orders.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No orders from other makers"
          description="Signed orders from other believers appear here — fill any of them on-chain, partially or in full."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <Tr className="hover:bg-transparent">
                <Th>Side</Th>
                <Th numeric>Price</Th>
                <Th numeric>Remaining</Th>
                <Th>Maker</Th>
                <Th aria-label="Fill" />
              </Tr>
            </THead>
            <TBody>
              {orders.map((o) => (
                <Tr key={o.id}>
                  <Td>
                    <Badge variant={o.side === "bid" ? "success" : "danger"}>
                      {o.side === "bid" ? "Bid" : "Ask"}
                    </Badge>
                  </Td>
                  <Td numeric>
                    {o.price.toFixed(3)} <span className="text-ink-subtle">{TOKEN_SYMBOL}</span>
                  </Td>
                  <Td numeric>{fmtNum(o.remaining)}</Td>
                  <Td className="font-mono text-xs text-ink-muted">
                    {o.maker.slice(0, 6)}…{o.maker.slice(-4)}
                  </Td>
                  <Td numeric className="py-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!connected}
                      onClick={() => open(o)}
                    >
                      {o.side === "ask" ? "Buy" : "Sell"}
                    </Button>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      <Dialog open={target !== null} onOpenChange={(v) => !v && !filling && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {takingAsk ? "Buy shares" : "Sell shares"} · Cohort #{target?.cohortIndex}
            </DialogTitle>
            <DialogDescription>
              Settles on-chain against the maker's signed order at{" "}
              {target?.price.toFixed(3)} {TOKEN_SYMBOL} per share.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <NumberInput
              label="Shares"
              value={amount}
              onChange={setAmount}
              placeholder="0"
              balance={cap}
              balanceLabel={takingAsk ? "Available" : "You can sell"}
              error={amountError}
            />
            <div className="flex items-baseline justify-between border-t border-line pt-3 text-[13px]">
              <span className="text-ink-muted">{takingAsk ? "You pay ≈" : "You receive ≈"}</span>
              <TokenAmount value={cost} className="text-ink" />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" disabled={filling} onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button disabled={!valid} loading={filling} onClick={fill}>
              {step ?? (takingAsk ? "Buy shares" : "Sell shares")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

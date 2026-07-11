"use client";

import { useState } from "react";
import { maxUint256, parseUnits } from "viem";
import { usePublicClient, useReadContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  NumberInput,
  Tabs,
  TabsList,
  TabsTrigger,
  TokenAmount,
  useToast,
} from "@/shared/ui";
import { useWallet } from "@/shared/lib/mock-wallet";
import { fmtNum } from "@/shared/lib/format";
import { TOKEN_SYMBOL } from "@/shared/config";
import type { OrderSide } from "@/entities/market";
import { api, type SignedOrderDto } from "@/lib/api/client";
import { usePremarket, type Order } from "@/lib/hooks/premarket";
import { useCampaignActions, useToken, useTokenActions } from "@/lib/hooks/campaign";
import { campaignContract } from "@/lib/contracts";

type Addr = `0x${string}`;

const ORDER_TTL_DAYS = 7;

interface OrderTicketProps {
  campaign: Addr;
  cohortIndex: number;
  /** Head cohort — a sell order is only fillable once the maker is settled to it. */
  currentCohort: number;
  /** Viewer's shares in this cohort — the sell-side ceiling. */
  yourShares: number;
}

/**
 * Rest a signed bid/ask. Signing is gasless; the order lives in the backend book
 * until someone fills it on-chain. Preflights make the order actually fillable:
 * a bid needs a USDC allowance (fills pull the maker's USDC), an ask needs the
 * maker settled to the head cohort (fillOrder reverts MakerNotSettled otherwise).
 */
export function OrderTicket({ campaign, cohortIndex, currentCohort, yourShares }: OrderTicketProps) {
  const wallet = useWallet();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const publicClient = usePublicClient();
  const premarket = usePremarket(campaign);
  const { settleTo } = useCampaignActions(campaign);
  const { approve } = useTokenActions();
  const { allowance } = useToken(wallet.address as Addr | undefined, campaign);
  const { data: settledUpTo } = useReadContract({
    ...campaignContract(campaign),
    functionName: "settledUpTo",
    args: [(wallet.address ?? "0x0000000000000000000000000000000000000000") as Addr],
    query: { enabled: wallet.status === "connected" },
  });

  const [side, setSide] = useState<OrderSide>("bid");
  const [price, setPrice] = useState("");
  const [size, setSize] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<string | null>(null);

  const parsedPrice = parseFloat(price) || 0;
  const parsedSize = parseFloat(size) || 0;
  const total = parsedPrice * parsedSize;
  const connected = wallet.status === "connected";

  const sizeError =
    side === "ask" && parsedSize > yourShares
      ? `You hold ${fmtNum(yourShares)} shares in this cohort`
      : undefined;
  const valid = connected && parsedPrice > 0 && parsedSize > 0 && total > 0 && !sizeError;

  async function submit() {
    if (!valid || !wallet.address) return;
    setSubmitting(true);
    try {
      const shareAmount = parseUnits(parsedSize.toFixed(6), 6);
      const usdcAmount = parseUnits(total.toFixed(6), 6);

      if (side === "bid" && allowance < usdcAmount) {
        // Fills pull the maker's USDC peer-to-peer — approve once, up front.
        setStep(`Approving ${TOKEN_SYMBOL}…`);
        const hash = await approve(campaign, maxUint256);
        await publicClient?.waitForTransactionReceipt({ hash });
      }
      if (side === "ask" && Number(settledUpTo ?? 0n) < currentCohort) {
        // Materialise the maker's cohort shares so takers can fill immediately.
        setStep("Settling your cohorts…");
        const hash = await settleTo(wallet.address as Addr, BigInt(currentCohort));
        await publicClient?.waitForTransactionReceipt({ hash });
      }

      setStep("Waiting for signature…");
      const order: Order = {
        maker: wallet.address as Addr,
        isSell: side === "ask",
        cohortId: BigInt(cohortIndex),
        shareAmount,
        usdcAmount,
        nonce: BigInt(Date.now()),
        deadline: BigInt(Math.floor(Date.now() / 1000) + ORDER_TTL_DAYS * 86_400),
      };
      const signature = await premarket.signOrder(order);

      setStep("Publishing…");
      const dto: SignedOrderDto = {
        maker: order.maker,
        isSell: order.isSell,
        cohortId: order.cohortId.toString(),
        shareAmount: order.shareAmount.toString(),
        usdcAmount: order.usdcAmount.toString(),
        nonce: order.nonce.toString(),
        deadline: order.deadline.toString(),
      };
      await api.submitOrder(campaign, dto, signature as Addr);
      await queryClient.invalidateQueries({ queryKey: ["v3", "orderbook", campaign.toLowerCase()] });

      setPrice("");
      setSize("");
      toast({
        title: side === "bid" ? "Bid resting" : "Ask resting",
        description: `${fmtNum(parsedSize)} shares of Cohort #${cohortIndex} at ${parsedPrice.toFixed(3)} ${TOKEN_SYMBOL} — signed off-chain, no gas spent.`,
        intent: "success",
      });
    } catch (e) {
      toast({
        title: "Order not placed",
        description:
          (e as { shortMessage?: string }).shortMessage ??
          (e instanceof Error ? e.message : "The request was rejected."),
        intent: "danger",
      });
    } finally {
      setSubmitting(false);
      setStep(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Place order</CardTitle>
        <span className="t-overline">Cohort #{cohortIndex}</span>
      </CardHeader>
      <CardBody className="space-y-4">
        <Tabs value={side} onValueChange={(v) => setSide(v as OrderSide)}>
          <TabsList variant="segmented" className="w-full">
            <TabsTrigger value="bid" className="flex-1">
              Buy
            </TabsTrigger>
            <TabsTrigger value="ask" className="flex-1">
              Sell
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <NumberInput
          label={`Price per share · ${TOKEN_SYMBOL}`}
          value={price}
          onChange={setPrice}
          placeholder="1.000"
        />
        <NumberInput
          label="Shares"
          value={size}
          onChange={setSize}
          placeholder="0"
          error={sizeError}
          {...(side === "ask" ? { balance: yourShares, balanceLabel: "You hold" } : {})}
        />

        <div className="flex items-baseline justify-between border-t border-line pt-3 text-[13px]">
          <span className="text-ink-muted">{side === "bid" ? "You pay up to" : "You receive up to"}</span>
          <TokenAmount value={total} className="text-ink" />
        </div>

        <Button className="w-full" disabled={!valid} loading={submitting} onClick={submit}>
          {step ?? (side === "bid" ? "Sign bid" : "Sign ask")}
        </Button>
        <p className="text-xs leading-5 text-ink-subtle">
          Orders are signed EIP-712 intents — free to place and cancel-safe until filled
          on-chain. Expires in {ORDER_TTL_DAYS} days.
        </p>
      </CardBody>
    </Card>
  );
}

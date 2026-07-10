"use client";

import { useState } from "react";
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

interface OrderTicketProps {
  cohortIndex: number;
  /** Viewer's shares in this cohort — the sell-side ceiling. */
  yourShares: number;
}

/** Place a resting bid/ask for cohort shares. Totals are always spelled out before submit. */
export function OrderTicket({ cohortIndex, yourShares }: OrderTicketProps) {
  const wallet = useWallet();
  const { toast } = useToast();
  const [side, setSide] = useState<OrderSide>("bid");
  const [price, setPrice] = useState("");
  const [size, setSize] = useState("");

  const parsedPrice = parseFloat(price) || 0;
  const parsedSize = parseFloat(size) || 0;
  const total = parsedPrice * parsedSize;
  const connected = wallet.status === "connected";

  const sizeError =
    side === "ask" && parsedSize > yourShares
      ? `You hold ${fmtNum(yourShares)} shares in this cohort`
      : undefined;
  const valid = connected && parsedPrice > 0 && parsedSize > 0 && !sizeError;

  function submit() {
    // TODO(onchain): wire premarket placeOrder(cohortId, side, price, size) + token/share approval.
    toast({
      title: side === "bid" ? "Bid placed" : "Ask placed",
      description: `${size} shares of Cohort #${cohortIndex} at ${parsedPrice.toFixed(3)} ${TOKEN_SYMBOL}.`,
      intent: "success",
      txHash: "0x7d3f2a8c5e1b9d4f6a0c3e7b2d8f5a1c9e4b6d0a3f7c2e8b5d1a9f4c6e0b3d7a",
    });
    setPrice("");
    setSize("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Place order</CardTitle>
        <span className="t-overline">Cohort #{cohortIndex}</span>
      </CardHeader>
      <CardBody className="space-y-4">
        <Tabs value={side} onValueChange={(v) => setSide(v as OrderSide)}>
          <TabsList variant="segmented" className="grid w-full grid-cols-2">
            <TabsTrigger value="bid">Buy</TabsTrigger>
            <TabsTrigger value="ask">Sell</TabsTrigger>
          </TabsList>
        </Tabs>

        <NumberInput
          label="Price per share"
          value={price}
          onChange={setPrice}
          suffix={TOKEN_SYMBOL}
          placeholder="1.000"
        />
        <NumberInput
          label="Size"
          value={size}
          onChange={setSize}
          suffix="shares"
          error={sizeError}
          hint={side === "ask" ? `You hold ${fmtNum(yourShares)} shares` : undefined}
        />

        <div className="flex items-baseline justify-between rounded-md bg-surface-2/70 px-3.5 py-2.5">
          <span className="text-[13px] text-ink-muted">Total</span>
          <TokenAmount value={total} className="text-sm font-medium" />
        </div>

        {connected ? (
          <Button
            className="w-full"
            variant={side === "bid" ? "primary" : "danger"}
            disabled={!valid}
            onClick={submit}
          >
            {side === "bid" ? "Place bid" : "Place ask"}
          </Button>
        ) : (
          <Button
            className="w-full"
            onClick={wallet.connect}
            loading={wallet.status === "connecting"}
          >
            Connect wallet to trade
          </Button>
        )}

        <p className="text-xs leading-5 text-ink-subtle">
          Orders rest onchain and settle atomically when matched. Cancel any time — no fees while
          unfilled.
        </p>
      </CardBody>
    </Card>
  );
}

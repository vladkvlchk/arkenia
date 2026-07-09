"use client";

import { useState } from "react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  NumberInput,
  TokenAmount,
  useToast,
} from "@/shared/ui";
import { parseUnits } from "viem";
import { usePublicClient } from "wagmi";
import { useCampaignActions } from "@/lib/hooks/campaign";
import { TOKEN_SYMBOL } from "@/shared/config";
import { fmtAmount } from "@/shared/lib/format";

interface PositionCardProps {
  address: `0x${string}`;
  poolBalance: number;
  claimableTotal: number;
  claimCohortIds: bigint[];
}

/** The believer's two balances: refundable pool money and claimable returns. */
export function PositionCard({ address, poolBalance, claimableTotal, claimCohortIds }: PositionCardProps) {
  const { toast } = useToast();
  const { refund, claim } = useCampaignActions(address);
  const publicClient = usePublicClient();
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const parsed = parseFloat(refundAmount) || 0;
  const refundError =
    parsed > poolBalance ? `Your refundable balance is ${fmtAmount(poolBalance)} ${TOKEN_SYMBOL}` : undefined;

  async function confirmRefund() {
    setSubmitting(true);
    try {
      const txHash = await refund(parseUnits(refundAmount || "0", 6));
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
      setRefundOpen(false);
      setRefundAmount("");
      toast({
        title: "Refund confirmed",
        description: `${refundAmount} ${TOKEN_SYMBOL} returned to your wallet 1:1.`,
        intent: "success",
        txHash,
      });
    } catch (e) {
      toast({
        title: "Refund failed",
        description: e instanceof Error ? e.message : "The transaction was rejected.",
        intent: "danger",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function claimAll() {
    setClaiming(true);
    try {
      const txHash = await claim(claimCohortIds);
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
      toast({
        title: "Claim confirmed",
        description: `${fmtAmount(claimableTotal)} ${TOKEN_SYMBOL} across your cohorts.`,
        intent: "success",
        txHash,
      });
    } catch (e) {
      toast({
        title: "Claim failed",
        description: e instanceof Error ? e.message : "The transaction was rejected.",
        intent: "danger",
      });
    } finally {
      setClaiming(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your position</CardTitle>
      </CardHeader>
      <CardBody className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-3">
          <div>
            <div className="t-overline">Pool balance · refundable 1:1</div>
            <TokenAmount value={poolBalance} className="mt-1.5 block text-xl font-medium" />
          </div>
          <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
            <Button
              variant="secondary"
              size="sm"
              disabled={poolBalance <= 0}
              onClick={() => setRefundOpen(true)}
            >
              Refund
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Refund from pool</DialogTitle>
                <DialogDescription>
                  Un-deployed deposits return to your wallet 1:1, any time.
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                <NumberInput
                  label="Amount"
                  value={refundAmount}
                  onChange={setRefundAmount}
                  suffix={TOKEN_SYMBOL}
                  balance={poolBalance}
                  balanceLabel="Refundable"
                  error={refundError}
                />
              </DialogBody>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="secondary">Cancel</Button>
                </DialogClose>
                <Button
                  onClick={confirmRefund}
                  loading={submitting}
                  disabled={parsed <= 0 || !!refundError}
                >
                  Confirm refund
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-3 border-line sm:border-l sm:pl-5">
          <div>
            <div className="t-overline">Claimable returns</div>
            <TokenAmount
              value={claimableTotal}
              className="mt-1.5 block text-xl font-medium text-success"
            />
          </div>
          <Button size="sm" loading={claiming} disabled={claimableTotal <= 0} onClick={claimAll}>
            Claim all
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import {
  Button,
  Card,
  CardBody,
  CardDescription,
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
import { parseUnits, maxUint256 } from "viem";
import { usePublicClient } from "wagmi";
import { useWallet } from "@/shared/lib/mock-wallet";
import { useCampaignActions, useToken, useTokenActions } from "@/lib/hooks/campaign";
import { fmtAmount } from "@/shared/lib/format";
import { TOKEN_SYMBOL } from "@/shared/config";

interface DepositPanelProps {
  address: `0x${string}`;
  campaignName: string;
}

/** Believer entry point. Amount is reviewed in a dialog before anything is signed. */
export function DepositPanel({ address, campaignName }: DepositPanelProps) {
  const wallet = useWallet();
  const { toast } = useToast();
  const { deposit } = useCampaignActions(address);
  const { approve } = useTokenActions();
  const { allowance } = useToken(wallet.address, address);
  const publicClient = usePublicClient();
  const [amount, setAmount] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const parsed = parseFloat(amount) || 0;
  const balance = wallet.tokenBalance ?? 0;
  const error =
    parsed > balance ? `Exceeds your balance of ${fmtAmount(balance)} ${TOKEN_SYMBOL}` : undefined;
  const valid = parsed > 0 && !error;

  async function confirmDeposit() {
    setSubmitting(true);
    try {
      const amt = parseUnits(amount || "0", 6);
      if (allowance < amt) {
        const approveHash = await approve(address, maxUint256);
        await publicClient?.waitForTransactionReceipt({ hash: approveHash });
      }
      const txHash = await deposit(amt);
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
      setReviewOpen(false);
      setAmount("");
      toast({
        title: "Deposit confirmed",
        description: `${amount} ${TOKEN_SYMBOL} to ${campaignName}. Refundable until deployed.`,
        intent: "success",
        txHash,
      });
    } catch (e) {
      toast({
        title: "Deposit failed",
        description: e instanceof Error ? e.message : "The transaction was rejected.",
        intent: "danger",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deposit</CardTitle>
        <CardDescription>
          Funds join the shared pool and stay refundable 1:1 until the angel deploys them.
        </CardDescription>
      </CardHeader>
      <CardBody className="space-y-4">
        {wallet.status !== "connected" ? (
          <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-line-strong px-4 py-8 text-center">
            <Wallet className="h-5 w-5 text-ink-subtle" aria-hidden />
            <p className="text-[13px] text-ink-muted">Connect a wallet to deposit.</p>
            <Button size="sm" onClick={wallet.connect} loading={wallet.status === "connecting"}>
              Connect wallet
            </Button>
          </div>
        ) : (
          <>
            <NumberInput
              label="Amount"
              value={amount}
              onChange={setAmount}
              suffix={TOKEN_SYMBOL}
              balance={balance}
              error={error}
            />
            <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
              <Button className="w-full" size="lg" disabled={!valid} onClick={() => setReviewOpen(true)}>
                Review deposit
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Review deposit</DialogTitle>
                  <DialogDescription>Nothing is signed until you confirm.</DialogDescription>
                </DialogHeader>
                <DialogBody className="space-y-3 text-sm">
                  <ReviewRow label="Campaign" value={campaignName} />
                  <ReviewRow label="Amount" value={<TokenAmount value={parsed} />} />
                  <ReviewRow label="Refundable" value="1:1, until deployed into a cohort" />
                </DialogBody>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="secondary">Cancel</Button>
                  </DialogClose>
                  <Button onClick={confirmDeposit} loading={submitting}>
                    Confirm deposit
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <p className="text-xs leading-5 text-ink-subtle">
              No lock-ups and no platform fee. When the angel deploys capital, your pool balance
              converts pro-rata into shares of the next cohort.
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[13px] text-ink-muted">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );
}

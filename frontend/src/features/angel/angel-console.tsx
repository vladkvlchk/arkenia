"use client";

import { useId, useState } from "react";
import { Info } from "lucide-react";
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
  Field,
  inputClasses,
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
import { parseUnits, maxUint256 } from "viem";
import { usePublicClient } from "wagmi";
import { useWallet } from "@/shared/lib/mock-wallet";
import { useCampaignActions, useToken, useTokenActions } from "@/lib/hooks/campaign";
import { cn } from "@/shared/lib/cn";
import { fmtAmount, fmtDate, fmtNum } from "@/shared/lib/format";
import { TOKEN_SYMBOL } from "@/shared/config";
import type { Campaign, Cohort } from "@/entities/campaign";

interface AngelConsoleProps {
  address: `0x${string}`;
  campaign: Campaign;
  cohorts: Cohort[];
  isAngel: boolean;
}

/** Angel-side controls: deploy pooled capital (mints a cohort) and return profit. */
export function AngelConsole({ address, campaign, cohorts, isAngel }: AngelConsoleProps) {
  const { toast } = useToast();
  const wallet = useWallet();
  const selectId = useId();
  const { withdraw, returnFunds, returnFundsToAll } = useCampaignActions(address);
  const { approve } = useTokenActions();
  const { allowance } = useToken(wallet.address, address);
  const publicClient = usePublicClient();

  const [deployAmount, setDeployAmount] = useState("");
  const [deployOpen, setDeployOpen] = useState(false);
  const [deploying, setDeploying] = useState(false);

  const [returnAmount, setReturnAmount] = useState("");
  const [returnTarget, setReturnTarget] = useState("all");
  const [returning, setReturning] = useState(false);

  const nextCohort = campaign.cohortCount + 1;
  const parsedDeploy = parseFloat(deployAmount) || 0;
  const deployError =
    parsedDeploy > campaign.poolBalance
      ? `Pool holds ${fmtAmount(campaign.poolBalance)} ${TOKEN_SYMBOL}`
      : undefined;

  const parsedReturn = parseFloat(returnAmount) || 0;

  async function confirmDeploy() {
    setDeploying(true);
    try {
      const txHash = await withdraw(parseUnits(deployAmount || "0", 6));
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
      setDeployOpen(false);
      setDeployAmount("");
      toast({
        title: `Cohort #${nextCohort} minted`,
        description: `${deployAmount} ${TOKEN_SYMBOL} deployed. Believers' pool balances converted pro-rata into shares.`,
        intent: "success",
        txHash,
      });
    } catch (e) {
      toast({
        title: "Deployment failed",
        description: e instanceof Error ? e.message : "The transaction was rejected.",
        intent: "danger",
      });
    } finally {
      setDeploying(false);
    }
  }

  async function submitReturn() {
    setReturning(true);
    try {
      const amt = parseUnits(returnAmount || "0", 6);
      // returnFunds pulls tUSDC from the angel — ensure the campaign is approved.
      if (allowance < amt) {
        const approveHash = await approve(address, maxUint256);
        await publicClient?.waitForTransactionReceipt({ hash: approveHash });
      }
      const txHash =
        returnTarget === "all"
          ? await returnFundsToAll(amt)
          : await returnFunds(amt, BigInt(returnTarget));
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
      const target =
        returnTarget === "all" ? "all cohorts, pro-rata by shares" : `Cohort #${returnTarget}`;
      toast({
        title: "Return confirmed",
        description: `${returnAmount} ${TOKEN_SYMBOL} to ${target}. Claimable by believers immediately.`,
        intent: "success",
        txHash,
      });
      setReturnAmount("");
    } catch (e) {
      toast({
        title: "Return failed",
        description: e instanceof Error ? e.message : "The transaction was rejected.",
        intent: "danger",
      });
    } finally {
      setReturning(false);
    }
  }

  return (
    <div className="space-y-4">
      {isAngel ? (
        <div className="flex items-start gap-2.5 rounded-md border border-info/25 bg-info-soft px-4 py-3 text-[13px] leading-5 text-info">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>Angel actions move believer funds and are permanently recorded onchain.</p>
        </div>
      ) : (
        <div className="flex items-start gap-2.5 rounded-md border border-warning/25 bg-warning-soft px-4 py-3 text-[13px] leading-5 text-warning">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>Only the campaign angel can deploy capital or return funds. Connect the angel wallet to act.</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Deploy capital</CardTitle>
            <CardDescription>
              Withdraws from the pool and mints Cohort #{nextCohort}. Believers&apos; pool balances
              convert pro-rata into cohort shares.
            </CardDescription>
          </CardHeader>
          <CardBody className="space-y-4">
            <NumberInput
              label="Amount to deploy"
              value={deployAmount}
              onChange={setDeployAmount}
              suffix={TOKEN_SYMBOL}
              balance={campaign.poolBalance}
              balanceLabel="Pool"
              error={deployError}
            />
            <Dialog open={deployOpen} onOpenChange={setDeployOpen}>
              <Button
                className="w-full"
                disabled={parsedDeploy <= 0 || !!deployError || !isAngel}
                onClick={() => setDeployOpen(true)}
              >
                Review deployment
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Mint Cohort #{nextCohort}</DialogTitle>
                  <DialogDescription>
                    This converts believers&apos; refundable balances into cohort shares. It cannot
                    be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogBody className="space-y-3 text-sm">
                  <Row label="Deploy" value={<TokenAmount value={parsedDeploy} />} />
                  <Row label="Mints" value={`Cohort #${nextCohort}`} />
                  <Row
                    label="Share supply"
                    value={`${fmtNum(parsedDeploy)} shares, pro-rata to depositors`}
                  />
                </DialogBody>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="secondary">Cancel</Button>
                  </DialogClose>
                  <Button onClick={confirmDeploy} loading={deploying}>
                    Deploy {deployAmount || "0"} {TOKEN_SYMBOL}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Return funds</CardTitle>
            <CardDescription>
              Distributes profit to cohort shareholders. Returns become claimable immediately.
            </CardDescription>
          </CardHeader>
          <CardBody className="space-y-4">
            <NumberInput
              label="Amount to return"
              value={returnAmount}
              onChange={setReturnAmount}
              suffix={TOKEN_SYMBOL}
            />
            <Field label="Distribute to" htmlFor={selectId}>
              <select
                id={selectId}
                value={returnTarget}
                onChange={(e) => setReturnTarget(e.target.value)}
                className={cn(inputClasses, "appearance-none")}
              >
                <option value="all">All cohorts — pro-rata by shares</option>
                {cohorts.map((c) => (
                  <option key={c.index} value={String(c.index)}>
                    Cohort #{c.index} — {fmtNum(c.totalShares)} shares
                  </option>
                ))}
              </select>
            </Field>
            <Button
              className="w-full"
              loading={returning}
              disabled={parsedReturn <= 0 || !isAngel}
              onClick={submitReturn}
            >
              Return funds
            </Button>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cohort ledger</CardTitle>
          <span className="t-overline">
            {fmtNum(campaign.totalWithdrawn)} deployed · {fmtNum(campaign.totalReturned)} returned
          </span>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <Tr className="hover:bg-transparent">
                <Th>Cohort</Th>
                <Th>Formed</Th>
                <Th numeric>Share supply</Th>
                <Th numeric>Returned · {TOKEN_SYMBOL}</Th>
                <Th numeric>Multiple</Th>
              </Tr>
            </THead>
            <TBody>
              {cohorts.map((c) => (
                <Tr key={c.index}>
                  <Td className="font-medium text-ink">#{c.index}</Td>
                  <Td className="text-ink-muted">{fmtDate(c.formedAt)}</Td>
                  <Td numeric>{fmtNum(c.totalShares)}</Td>
                  <Td numeric>{fmtNum(c.returned)}</Td>
                  <Td numeric className={c.returned > 0 ? "text-ink" : "text-ink-subtle"}>
                    {c.totalShares > 0 ? `${(c.returned / c.totalShares).toFixed(2)}×` : "—"}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[13px] text-ink-muted">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );
}

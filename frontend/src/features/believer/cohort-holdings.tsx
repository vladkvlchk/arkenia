"use client";

import { useState } from "react";
import { Layers } from "lucide-react";
import { usePublicClient } from "wagmi";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  EmptyState,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  useToast,
} from "@/shared/ui";
import { useCampaignActions } from "@/lib/hooks/campaign";
import { fmtAmount, fmtDate, fmtNum, fmtPct } from "@/shared/lib/format";
import { TOKEN_SYMBOL } from "@/shared/config";
import type { Cohort } from "@/entities/campaign";

/** Per-cohort share ledger for the connected believer. All cohorts shown — including ones you're not in. */
export function CohortHoldings({ address, cohorts }: { address: `0x${string}`; cohorts: Cohort[] }) {
  const { toast } = useToast();
  const { claim: claimReward } = useCampaignActions(address);
  const publicClient = usePublicClient();
  const [claimingIndex, setClaimingIndex] = useState<number | null>(null);

  async function claim(cohort: Cohort) {
    setClaimingIndex(cohort.index);
    try {
      const txHash = await claimReward([BigInt(cohort.index)]);
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
      toast({
        title: `Claimed from Cohort #${cohort.index}`,
        description: `${fmtAmount(cohort.yourClaimable)} ${TOKEN_SYMBOL} to your wallet.`,
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
      setClaimingIndex(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cohort holdings</CardTitle>
        <CardDescription>
          Each angel deployment mints a cohort; your pool balance converts pro-rata into its
          shares. Amounts in {TOKEN_SYMBOL}.
        </CardDescription>
      </CardHeader>
      {cohorts.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No cohorts formed yet"
          description="When the angel deploys pooled capital for the first time, Cohort #1 is minted and appears here."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <Tr className="hover:bg-transparent">
                <Th>Cohort</Th>
                <Th>Formed</Th>
                <Th numeric>Your shares</Th>
                <Th numeric>Returned</Th>
                <Th numeric>Claimable</Th>
                <Th aria-label="Actions" />
              </Tr>
            </THead>
            <TBody>
              {cohorts.map((c) => {
                const member = c.yourShares > 0;
                return (
                  <Tr key={c.index} className={member ? undefined : "text-ink-subtle"}>
                    <Td className="font-medium text-ink">#{c.index}</Td>
                    <Td className="text-ink-muted">{fmtDate(c.formedAt)}</Td>
                    <Td numeric>
                      {member ? (
                        <>
                          {fmtNum(c.yourShares)}{" "}
                          <span className="text-ink-subtle">· {fmtPct(c.yourShares / c.totalShares)}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td numeric className="text-ink-muted">
                      {fmtNum(c.returned)}
                    </Td>
                    <Td numeric>
                      {c.yourClaimable > 0 ? (
                        <span className="font-medium text-success">{fmtAmount(c.yourClaimable)}</span>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td numeric className="py-2">
                      {member && (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={claimingIndex === c.index}
                          disabled={c.yourClaimable <= 0}
                          onClick={() => claim(c)}
                        >
                          Claim
                        </Button>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

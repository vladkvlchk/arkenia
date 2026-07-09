"use client";

import { useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { campaignContract, factoryContract, tokenContract } from "../contracts";
import { activeChain } from "../config";

type Addr = `0x${string}`;

/**
 * V3 on-chain hooks layer. Presentational components (from the design pass) plug their
 * `// TODO(onchain)` seams into these. All reads are batched via multicall; all writes return
 * a tx hash promise via wagmi's writeContractAsync so the UI can await + toast.
 *
 * NOTE: deposit/refund/claim/etc. are `nonReentrant` and pull/settle on-chain — the UI should
 * refetch reads after a confirmed tx (wagmi useWaitForTransactionReceipt → invalidate).
 */

// ─────────────────────────── reads ───────────────────────────

/** All campaign clone addresses from the factory. */
export function useCampaigns() {
  const { data, ...rest } = useReadContract({ ...factoryContract, functionName: "getCampaigns" });
  return { campaigns: ((data as readonly Addr[]) ?? []) as Addr[], ...rest };
}

export interface CampaignSummary {
  angel: Addr;
  token: Addr;
  poolTotal: bigint;
  currentCohort: bigint;
  totalShares: bigint;
  rewardReserves: bigint;
}

/** Core campaign state in one multicall. */
export function useCampaignSummary(campaign?: Addr) {
  const c = campaign ? campaignContract(campaign) : undefined;
  const { data, ...rest } = useReadContracts({
    query: { enabled: !!campaign },
    contracts: c
      ? [
          { ...c, functionName: "angel" },
          { ...c, functionName: "token" },
          { ...c, functionName: "poolTotal" },
          { ...c, functionName: "currentCohort" },
          { ...c, functionName: "totalShares" },
          { ...c, functionName: "rewardReserves" },
        ]
      : [],
  });
  const summary: CampaignSummary | undefined = data && {
    angel: data[0]?.result as Addr,
    token: data[1]?.result as Addr,
    poolTotal: (data[2]?.result as bigint) ?? 0n,
    currentCohort: (data[3]?.result as bigint) ?? 0n,
    totalShares: (data[4]?.result as bigint) ?? 0n,
    rewardReserves: (data[5]?.result as bigint) ?? 0n,
  };
  return { summary, ...rest };
}

export interface MyPosition {
  refundable: bigint;
  pendingReward: bigint;
  /** shares held per cohort, index i => cohort (i+1) */
  cohortShares: bigint[];
}

/** A believer's position: refundable pool balance, claimable reward, and per-cohort shares. */
export function useMyPosition(campaign?: Addr, user?: Addr, currentCohort = 0n) {
  const c = campaign ? campaignContract(campaign) : undefined;
  const cohortIds = Array.from({ length: Number(currentCohort) }, (_, i) => BigInt(i + 1));
  // Dynamic heterogeneous multicall (fixed calls + a mapped list): wagmi's strict tuple typing
  // can't narrow this, so we cast the contracts array and the results (standard pattern).
  const contracts = c && user
    ? [
        { ...c, functionName: "refundableOf", args: [user] },
        { ...c, functionName: "pendingRewardOf", args: [user, cohortIds] },
        ...cohortIds.map((n) => ({ ...c, functionName: "cohortSharesOf", args: [user, n] })),
      ]
    : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, ...rest } = useReadContracts({ query: { enabled: !!campaign && !!user }, contracts: contracts as any });
  const results = data as ({ result?: unknown } | undefined)[] | undefined;
  const position: MyPosition | undefined = results && {
    refundable: (results[0]?.result as bigint) ?? 0n,
    pendingReward: (results[1]?.result as bigint) ?? 0n,
    cohortShares: results.slice(2).map((d) => (d?.result as bigint) ?? 0n),
  };
  return { position, ...rest };
}

/** Token balance, decimals, and (optional) allowance for a spender. */
export function useToken(user?: Addr, spender?: Addr) {
  const { data, ...rest } = useReadContracts({
    query: { enabled: !!user },
    contracts: user
      ? [
          { ...tokenContract, functionName: "balanceOf", args: [user] },
          { ...tokenContract, functionName: "decimals" },
          { ...tokenContract, functionName: "allowance", args: [user, spender ?? user] },
        ]
      : [],
  });
  return {
    balance: (data?.[0]?.result as bigint) ?? 0n,
    decimals: (data?.[1]?.result as number) ?? 6,
    allowance: (data?.[2]?.result as bigint) ?? 0n,
    ...rest,
  };
}

// ─────────────────────────── writes ───────────────────────────

/** Believer + angel actions against one campaign. Each returns a tx-hash promise. */
export function useCampaignActions(campaign: Addr) {
  const { writeContractAsync, ...rest } = useWriteContract();
  const c = campaignContract(campaign);
  // Pin every write to the target chain so the wallet is forced to switch (or the send is
  // blocked) rather than silently transacting on whatever network it happens to be on.
  const chainId = activeChain.id;
  return {
    ...rest,
    deposit: (amount: bigint) => writeContractAsync({ ...c, functionName: "deposit", args: [amount], chainId }),
    refund: (amount: bigint) => writeContractAsync({ ...c, functionName: "refund", args: [amount], chainId }),
    claim: (cohortIds: bigint[]) => writeContractAsync({ ...c, functionName: "claim", args: [cohortIds], chainId }),
    settleTo: (user: Addr, toCohort: bigint) =>
      writeContractAsync({ ...c, functionName: "settleTo", args: [user, toCohort], chainId }),
    // angel-only (revert for non-angel):
    withdraw: (amount: bigint) => writeContractAsync({ ...c, functionName: "withdraw", args: [amount], chainId }),
    returnFunds: (amount: bigint, cohortId: bigint) =>
      writeContractAsync({ ...c, functionName: "returnFunds", args: [amount, cohortId], chainId }),
    returnFundsToAll: (amount: bigint) =>
      writeContractAsync({ ...c, functionName: "returnFundsToAll", args: [amount], chainId }),
  };
}

/** ERC20 approve + testnet faucet. */
export function useTokenActions() {
  const { writeContractAsync, ...rest } = useWriteContract();
  const chainId = activeChain.id;
  return {
    ...rest,
    approve: (spender: Addr, amount: bigint) =>
      writeContractAsync({ ...tokenContract, functionName: "approve", args: [spender, amount], chainId }),
    faucet: () => writeContractAsync({ ...tokenContract, functionName: "faucet", chainId }),
  };
}

/** Create a new campaign via the factory (token must be whitelisted). */
export function useCreateCampaign() {
  const { writeContractAsync, ...rest } = useWriteContract();
  const chainId = activeChain.id;
  return {
    ...rest,
    createCampaign: (token: Addr) =>
      writeContractAsync({ ...factoryContract, functionName: "createCampaign", args: [token], chainId }),
  };
}

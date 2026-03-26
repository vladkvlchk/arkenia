"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatUnits, parseUnits } from "viem";
import { fmt, fmtToken } from "@/lib/fmt";
import Link from "next/link";
import {
  useAccount,
  useReadContracts,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useWatchContractEvent,
} from "wagmi";
import { CAMPAIGN_ABI, ERC20_ABI } from "@/lib/abi";
import { API_URL } from "@/lib/config";
import { DepositForm } from "@/components/DepositForm";
import { Comments } from "@/components/Comments";
import { ActivityFeed } from "@/components/ActivityFeed";

interface CampaignMeta {
  name: string;
  description: string;
  logo_url: string;
  cover_url: string;
}

interface CreatorProfile {
  twitterUsername?: string;
  twitterAvatar?: string;
}

export default function CampaignPage() {
  const params = useParams();
  const rawParam = params.address as string;
  const isAddress = rawParam.startsWith("0x");

  const [resolvedAddress, setResolvedAddress] = useState<`0x${string}` | null>(
    isAddress ? (rawParam as `0x${string}`) : null
  );
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (isAddress) return;
    fetch(`${API_URL}/api/stats/campaigns/by-username/${rawParam}`)
      .then((r) => r.json())
      .then((campaigns) => {
        if (campaigns.length > 0) {
          setResolvedAddress(campaigns[0].campaign as `0x${string}`);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true));
  }, [rawParam, isAddress]);

  const campaignAddress = resolvedAddress!;
  const { address: userAddress } = useAccount();
  const [meta, setMeta] = useState<CampaignMeta | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile | null>(null);

  useEffect(() => {
    if (!resolvedAddress) return;
    fetch(`${API_URL}/api/stats/campaign/${resolvedAddress}/meta`)
      .then((r) => r.json())
      .then((data) => data && setMeta(data))
      .catch(() => {});
  }, [resolvedAddress]);

  const { data: results, refetch: refetchCampaign } = useReadContracts({
    contracts: resolvedAddress
      ? [
          { address: resolvedAddress, abi: CAMPAIGN_ABI, functionName: "creator" },
          { address: resolvedAddress, abi: CAMPAIGN_ABI, functionName: "floor" },
          { address: resolvedAddress, abi: CAMPAIGN_ABI, functionName: "ceil" },
          { address: resolvedAddress, abi: CAMPAIGN_ABI, functionName: "totalRaised" },
          { address: resolvedAddress, abi: CAMPAIGN_ABI, functionName: "token" },
          { address: resolvedAddress, abi: CAMPAIGN_ABI, functionName: "withdrawnAt" },
          { address: resolvedAddress, abi: CAMPAIGN_ABI, functionName: "returnedAmount" },
        ]
      : [],
  });

  const tokenAddress = results?.[4]?.result as `0x${string}` | undefined;

  const { data: tokenResults } = useReadContracts({
    contracts: tokenAddress
      ? [
          { address: tokenAddress, abi: ERC20_ABI, functionName: "symbol" },
          { address: tokenAddress, abi: ERC20_ABI, functionName: "decimals" },
        ]
      : [],
  });

  const { data: myInvestment, refetch: refetchInvestment } = useReadContract({
    address: resolvedAddress ?? undefined,
    abi: CAMPAIGN_ABI,
    functionName: "invests",
    args: userAddress ? [userAddress] : undefined,
  });

  const { data: myClaimed, refetch: refetchClaimed } = useReadContract({
    address: resolvedAddress ?? undefined,
    abi: CAMPAIGN_ABI,
    functionName: "claimed",
    args: userAddress ? [userAddress] : undefined,
  });

  // Watch for Deposited events — auto-update on anyone's deposit
  useWatchContractEvent({
    address: resolvedAddress ?? undefined,
    abi: CAMPAIGN_ABI,
    eventName: "Deposited",
    onLogs: () => {
      refetchCampaign();
      refetchInvestment();
    },
  });

  // Also watch Withdrawn, FundsReturned, Refunded
  useWatchContractEvent({
    address: resolvedAddress ?? undefined,
    abi: CAMPAIGN_ABI,
    eventName: "Withdrawn",
    onLogs: () => refetchCampaign(),
  });

  useWatchContractEvent({
    address: resolvedAddress ?? undefined,
    abi: CAMPAIGN_ABI,
    eventName: "FundsReturned",
    onLogs: () => refetchCampaign(),
  });

  useWatchContractEvent({
    address: resolvedAddress ?? undefined,
    abi: CAMPAIGN_ABI,
    eventName: "Refunded",
    onLogs: () => {
      refetchCampaign();
      refetchInvestment();
    },
  });

  const handleDeposited = useCallback(() => {
    refetchCampaign();
    refetchInvestment();
  }, [refetchCampaign, refetchInvestment]);

  const creatorAddr = results?.[0]?.result as string | undefined;
  useEffect(() => {
    if (!creatorAddr) return;
    fetch(`${API_URL}/api/auth/profile/${creatorAddr}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.linked) {
          setCreatorProfile({
            twitterUsername: data.twitterUsername,
            twitterAvatar: data.twitterAvatar,
          });
        }
      })
      .catch(() => {});
  }, [creatorAddr]);

  if (notFound) {
    return <div className="text-center py-16 text-gray-400">Campaign not found</div>;
  }

  if (
    !resolvedAddress ||
    !results ||
    results.length < 7 ||
    results.some((r) => r.status !== "success") ||
    !tokenResults ||
    tokenResults.length < 2 ||
    tokenResults.some((r) => r.status !== "success")
  ) {
    return <div className="text-center py-16 text-gray-400">Loading campaign...</div>;
  }

  const creator = results[0]!.result as string;
  const floor = results[1]!.result as bigint;
  const ceil = results[2]!.result as bigint;
  const totalRaised = results[3]!.result as bigint;
  const withdrawnAt = results[5]!.result as bigint;
  const returnedAmount = results[6]!.result as bigint;
  const tokenSymbol = tokenResults[0]!.result as string;
  const tokenDecimals = tokenResults[1]!.result as number;

  const raised = Number(formatUnits(totalRaised, tokenDecimals));
  const ceilNum = Number(formatUnits(ceil, tokenDecimals));
  const floorNum = Number(formatUnits(floor, tokenDecimals));
  const progress = ceilNum > 0 ? Math.min((raised / ceilNum) * 100, 100) : 0;
  const isCreator = userAddress?.toLowerCase() === creator.toLowerCase();
  const isClosed = withdrawnAt > 0n;
  const isActive = !isClosed;
  const hasInvestment = myInvestment !== undefined && myInvestment > 0n;
  const floorMet = floor === 0n || totalRaised >= floor;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Cover image */}
      {meta?.cover_url && (
        <div className="rounded-xl overflow-hidden mb-4 h-48">
          <img src={meta.cover_url} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold">{meta?.name || "Campaign"}</h1>
          <span
            className={`text-xs px-2 py-1 rounded-full ${isClosed ? "bg-gray-300 text-gray-600" : "bg-gray-900 text-white"}`}
          >
            {isClosed ? "Closed" : "Active"}
          </span>
        </div>
        <p className="text-gray-500 font-mono text-sm">{campaignAddress}</p>
        <div className="flex items-center gap-1.5 text-sm mt-1">
          <span className="text-gray-500">by</span>
          <Link href={`/profile/${creator}`} className="text-gray-600 hover:text-gray-900 hover:underline inline-flex items-center gap-1.5">
            {creatorProfile?.twitterAvatar && (
              <img src={creatorProfile.twitterAvatar} alt="" className="w-5 h-5 rounded-full" />
            )}
            {creatorProfile?.twitterUsername
              ? `@${creatorProfile.twitterUsername}`
              : `${creator.slice(0, 6)}...${creator.slice(-4)}`}
          </Link>
        </div>
        {meta?.description && (
          <p className="text-gray-600 text-sm mt-3">{meta.description}</p>
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left column — campaign info & creator/investor actions */}
        <div className="lg:col-span-3 space-y-4">
          {/* Claim — investor, after returnFunds */}
          {isClosed && hasInvestment && returnedAmount > 0n && (
            <ClaimSection
              campaignAddress={campaignAddress}
              tokenDecimals={tokenDecimals}
              tokenSymbol={tokenSymbol}
              myInvestment={myInvestment!}
              totalRaised={totalRaised}
              returnedAmount={returnedAmount}
              myClaimed={myClaimed ?? 0n}
              onClaimed={refetchClaimed}
            />
          )}

          {/* Creator actions */}
          {isCreator && isActive && floorMet && totalRaised > 0n && (
            <WithdrawSection campaignAddress={campaignAddress} />
          )}

          {isCreator && isClosed && tokenAddress && (
            <ReturnFundsSection
              campaignAddress={campaignAddress}
              tokenAddress={tokenAddress}
              tokenDecimals={tokenDecimals}
              tokenSymbol={tokenSymbol}
            />
          )}

          <ActivityFeed
            campaignAddress={campaignAddress}
            tokenSymbol={tokenSymbol}
            tokenDecimals={tokenDecimals}
          />

          <Comments campaignAddress={campaignAddress} />
        </div>

        {/* Right column — progress + deposit */}
        <div className="lg:col-span-2 space-y-4">
          {/* Progress card */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">
                {fmt(raised, 2)} {tokenSymbol} raised
              </span>
              {ceilNum > 0 && <span className="text-gray-400">{progress.toFixed(0)}%</span>}
            </div>
            {ceilNum > 0 && (
              <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden mb-4">
                <div
                  className="h-full bg-gray-900 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
                {floorNum > 0 && ceilNum > 0 && (
                  <div
                    className="absolute top-0 w-0.5 h-full bg-yellow-500"
                    style={{ left: `${Math.min((floorNum / ceilNum) * 100, 100)}%` }}
                  />
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Floor</span>
                <p className="text-gray-900">
                  {floorNum > 0 ? `${fmt(floorNum, 2)} ${tokenSymbol}` : "None"}
                </p>
              </div>
              <div>
                <span className="text-gray-400">Ceil</span>
                <p className="text-gray-900">
                  {ceilNum > 0 ? `${fmt(ceilNum, 2)} ${tokenSymbol}` : "Unlimited"}
                </p>
              </div>
            </div>
            {hasInvestment && (
              <div className="mt-3 pt-3 border-t border-gray-200 text-sm">
                <span className="text-gray-400">Your investment: </span>
                <span className="text-green-600">
                  {fmtToken(myInvestment!, tokenDecimals)} {tokenSymbol}
                </span>
              </div>
            )}
            {returnedAmount > 0n && (
              <div className="mt-2 text-sm">
                <span className="text-gray-400">Returned by creator: </span>
                <span className="text-amber-600">
                  {fmtToken(returnedAmount, tokenDecimals)} {tokenSymbol}
                </span>
              </div>
            )}
          </div>

          {/* Deposit / Refund form — only when active */}
          {isActive && tokenAddress && (
            <DepositForm
              campaignAddress={campaignAddress}
              tokenAddress={tokenAddress}
              tokenSymbol={tokenSymbol}
              tokenDecimals={tokenDecimals}
              onDeposited={handleDeposited}
              refund={hasInvestment ? { maxAmount: myInvestment! } : undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ClaimSection({
  campaignAddress,
  tokenDecimals,
  tokenSymbol,
  myInvestment,
  totalRaised,
  returnedAmount,
  myClaimed,
  onClaimed,
}: {
  campaignAddress: `0x${string}`;
  tokenDecimals: number;
  tokenSymbol: string;
  myInvestment: bigint;
  totalRaised: bigint;
  returnedAmount: bigint;
  myClaimed: bigint;
  onClaimed: () => void;
}) {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) onClaimed();
  }, [isSuccess, onClaimed]);

  const totalClaimable = (returnedAmount * myInvestment) / totalRaised;
  const claimable = totalClaimable - myClaimed;

  function handleClaim() {
    writeContract({
      address: campaignAddress,
      abi: CAMPAIGN_ABI,
      functionName: "claim",
    });
  }

  if (claimable <= 0n) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-lg font-semibold mb-2">Claim Returned Funds</h3>
      <p className="text-sm text-gray-500 mb-3">
        You can claim {fmtToken(claimable, tokenDecimals)} {tokenSymbol}
      </p>
      <button
        onClick={handleClaim}
        disabled={isPending || isConfirming}
        className="rounded-lg bg-green-600 px-5 py-2 text-white font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {isPending ? "Confirm..." : isConfirming ? "Claiming..." : "Claim"}
      </button>
      {isSuccess && <p className="mt-2 text-sm text-green-600">Claimed!</p>}
    </div>
  );
}

function WithdrawSection({ campaignAddress }: { campaignAddress: `0x${string}` }) {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  function handleWithdraw() {
    writeContract({
      address: campaignAddress,
      abi: CAMPAIGN_ABI,
      functionName: "withdraw",
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-lg font-semibold mb-2">Creator: Withdraw Funds</h3>
      <p className="text-sm text-gray-500 mb-3">
        Floor met. You can withdraw all raised funds.
      </p>
      <button
        onClick={handleWithdraw}
        disabled={isPending || isConfirming}
        className="rounded-lg bg-green-600 px-5 py-2 text-white font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {isPending ? "Confirm..." : isConfirming ? "Withdrawing..." : "Withdraw"}
      </button>
      {isSuccess && <p className="mt-2 text-sm text-green-600">Withdrawn!</p>}
    </div>
  );
}

function ReturnFundsSection({
  campaignAddress,
  tokenAddress,
  tokenDecimals,
  tokenSymbol,
}: {
  campaignAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
  tokenDecimals: number;
  tokenSymbol: string;
}) {
  const { address } = useAccount();
  const [amount, setAmount] = useState("");

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, campaignAddress] : undefined,
  });

  const {
    writeContract: approve,
    data: approveHash,
    isPending: approvePending,
  } = useWriteContract();
  const { isLoading: approveConfirming, isSuccess: approveSuccess } =
    useWaitForTransactionReceipt({ hash: approveHash });

  const {
    writeContract: returnFunds,
    data: returnHash,
    isPending: returnPending,
  } = useWriteContract();
  const { isLoading: returnConfirming, isSuccess: returnSuccess } =
    useWaitForTransactionReceipt({ hash: returnHash });

  useEffect(() => {
    if (approveSuccess) refetchAllowance();
  }, [approveSuccess, refetchAllowance]);

  const parsedAmount = amount ? parseUnits(amount, tokenDecimals) : 0n;
  const needsApproval = allowance !== undefined && parsedAmount > allowance;

  function handleApprove() {
    if (!parsedAmount) return;
    approve({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [campaignAddress, parsedAmount],
    });
  }

  function handleReturn() {
    if (!parsedAmount) return;
    returnFunds({
      address: campaignAddress,
      abi: CAMPAIGN_ABI,
      functionName: "returnFunds",
      args: [parsedAmount],
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-lg font-semibold mb-2">Creator: Return Funds</h3>
      <p className="text-sm text-gray-500 mb-3">
        Return funds to investors proportionally.
      </p>
      <div className="flex gap-2">
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder={`Amount in ${tokenSymbol}`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="flex-1 rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900"
        />
        {needsApproval ? (
          <button
            onClick={handleApprove}
            disabled={approvePending || approveConfirming || !amount}
            className="rounded-lg bg-gray-700 px-5 py-2 text-white font-medium hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {approvePending ? "Confirm..." : approveConfirming ? "Approving..." : "Approve"}
          </button>
        ) : (
          <button
            onClick={handleReturn}
            disabled={returnPending || returnConfirming || !amount}
            className="rounded-lg bg-gray-900 px-5 py-2 text-white font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {returnPending ? "Confirm..." : returnConfirming ? "Returning..." : "Return"}
          </button>
        )}
      </div>
      {returnSuccess && <p className="mt-2 text-sm text-green-600">Funds returned!</p>}
    </div>
  );
}

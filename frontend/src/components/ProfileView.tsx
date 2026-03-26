"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { FACTORY_ABI, CAMPAIGN_ABI, ERC20_ABI } from "@/lib/abi";
import { FACTORY_ADDRESS, API_URL, AUTH_URL } from "@/lib/config";
import { fmt, fmtToken } from "@/lib/fmt";
import Link from "next/link";

interface TwitterProfile {
  linked: boolean;
  twitterUsername?: string;
  twitterAvatar?: string;
  twitterScore?: number | null;
}

interface UserStats {
  wallet: string;
  campaigns_created: number;
  creator_total_raised: string;
  creator_total_returned: string;
  creator_pnl: string;
  campaigns_invested: number;
  investor_total_deposited: string;
  investor_total_claimed: string;
  investor_total_refunded: string;
  investor_pnl: string;
}

interface CampaignData {
  address: `0x${string}`;
  creator: string;
  totalRaised: bigint;
  withdrawnAt: bigint;
  returnedAmount: bigint;
  tokenAddress: `0x${string}`;
  tokenSymbol: string;
  tokenDecimals: number;
}

export function ProfileView({ address }: { address: string }) {
  const { address: myAddress } = useAccount();
  const isOwnProfile = myAddress?.toLowerCase() === address.toLowerCase();

  const [twitter, setTwitter] = useState<TwitterProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);

  const fetchStats = useCallback(() => {
    fetch(`${API_URL}/api/stats/user/${address}`)
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => setStats(null));
  }, [address]);

  useEffect(() => {
    setTwitter(null);
    setStats(null);

    fetch(`${API_URL}/api/auth/profile/${address}`)
      .then((r) => r.json())
      .then(setTwitter)
      .catch(() => setTwitter({ linked: false }));

    fetchStats();
  }, [address, fetchStats]);

  const { data: campaigns } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: "getCampaigns",
  });

  const campaignAddresses = campaigns ?? [];

  const campaignContracts = useMemo(
    () =>
      campaignAddresses.flatMap((addr) => [
        { address: addr, abi: CAMPAIGN_ABI, functionName: "creator" as const },
        { address: addr, abi: CAMPAIGN_ABI, functionName: "totalRaised" as const },
        { address: addr, abi: CAMPAIGN_ABI, functionName: "withdrawnAt" as const },
        { address: addr, abi: CAMPAIGN_ABI, functionName: "returnedAmount" as const },
        { address: addr, abi: CAMPAIGN_ABI, functionName: "token" as const },
        { address: addr, abi: CAMPAIGN_ABI, functionName: "invests" as const, args: [address as `0x${string}`] },
        { address: addr, abi: CAMPAIGN_ABI, functionName: "claimed" as const, args: [address as `0x${string}`] },
      ]),
    [campaignAddresses, address]
  );

  const FIELDS_PER_CAMPAIGN = 7;

  const { data: campaignResults, refetch: refetchCampaigns } = useReadContracts({ contracts: campaignContracts });

  const tokenAddresses = useMemo(() => {
    if (!campaignResults) return [];
    const tokens = new Set<`0x${string}`>();
    for (let i = 0; i < campaignAddresses.length; i++) {
      const base = i * FIELDS_PER_CAMPAIGN;
      const creator = campaignResults[base]?.result as string | undefined;
      const tokenAddr = campaignResults[base + 4]?.result as `0x${string}` | undefined;
      const investment = campaignResults[base + 5]?.result as bigint | undefined;
      if (tokenAddr && (creator?.toLowerCase() === address.toLowerCase() || (investment && investment > 0n))) {
        tokens.add(tokenAddr);
      }
    }
    return Array.from(tokens);
  }, [campaignResults, campaignAddresses, address]);

  const tokenContracts = useMemo(
    () =>
      tokenAddresses.flatMap((addr) => [
        { address: addr, abi: ERC20_ABI, functionName: "symbol" as const },
        { address: addr, abi: ERC20_ABI, functionName: "decimals" as const },
      ]),
    [tokenAddresses]
  );

  const { data: tokenResults } = useReadContracts({ contracts: tokenContracts });

  const tokenInfo = useMemo(() => {
    const map = new Map<string, { symbol: string; decimals: number }>();
    if (!tokenResults) return map;
    for (let i = 0; i < tokenAddresses.length; i++) {
      const symbol = tokenResults[i * 2]?.result as string | undefined;
      const decimals = tokenResults[i * 2 + 1]?.result as number | undefined;
      if (symbol && decimals !== undefined) {
        map.set(tokenAddresses[i].toLowerCase(), { symbol, decimals });
      }
    }
    return map;
  }, [tokenResults, tokenAddresses]);

  const creatorCampaigns = useMemo(() => {
    if (!campaignResults || tokenInfo.size === 0) return [];
    const result: CampaignData[] = [];
    for (let i = 0; i < campaignAddresses.length; i++) {
      const base = i * FIELDS_PER_CAMPAIGN;
      const creator = campaignResults[base]?.result as string | undefined;
      if (creator?.toLowerCase() !== address.toLowerCase()) continue;

      const tokenAddr = campaignResults[base + 4]?.result as `0x${string}`;
      const info = tokenInfo.get(tokenAddr.toLowerCase());
      if (!info) continue;

      result.push({
        address: campaignAddresses[i],
        creator: creator!,
        totalRaised: (campaignResults[base + 1]?.result as bigint) ?? 0n,
        withdrawnAt: (campaignResults[base + 2]?.result as bigint) ?? 0n,
        returnedAmount: (campaignResults[base + 3]?.result as bigint) ?? 0n,
        tokenAddress: tokenAddr,
        tokenSymbol: info.symbol,
        tokenDecimals: info.decimals,
      });
    }
    return result;
  }, [campaignResults, campaignAddresses, address, tokenInfo]);

  interface ClaimableItem {
    campaignAddress: `0x${string}`;
    claimable: bigint;
    tokenSymbol: string;
    tokenDecimals: number;
  }

  const claimableItems = useMemo(() => {
    if (!campaignResults || tokenInfo.size === 0) return [];
    const result: ClaimableItem[] = [];
    for (let i = 0; i < campaignAddresses.length; i++) {
      const base = i * FIELDS_PER_CAMPAIGN;
      const totalRaised = (campaignResults[base + 1]?.result as bigint) ?? 0n;
      const returnedAmount = (campaignResults[base + 3]?.result as bigint) ?? 0n;
      const tokenAddr = campaignResults[base + 4]?.result as `0x${string}` | undefined;
      const investment = (campaignResults[base + 5]?.result as bigint) ?? 0n;
      const alreadyClaimed = (campaignResults[base + 6]?.result as bigint) ?? 0n;

      if (!tokenAddr || investment === 0n || returnedAmount === 0n || totalRaised === 0n) continue;

      const totalClaimable = (returnedAmount * investment) / totalRaised;
      const claimable = totalClaimable - alreadyClaimed;
      if (claimable <= 0n) continue;

      const info = tokenInfo.get(tokenAddr.toLowerCase());
      if (!info) continue;

      result.push({
        campaignAddress: campaignAddresses[i],
        claimable,
        tokenSymbol: info.symbol,
        tokenDecimals: info.decimals,
      });
    }
    return result;
  }, [campaignResults, campaignAddresses, tokenInfo]);

  const creatorPnl = stats ? Number(stats.creator_pnl) : 0;
  const investorPnl = stats ? Number(stats.investor_pnl) : 0;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1">Profile</h1>
            <p className="text-gray-500 font-mono text-sm">{address}</p>
          </div>

          {/* Twitter section */}
          <div className="flex items-center gap-3">
            {twitter === null ? (
              <span className="text-gray-400 text-sm">Loading...</span>
            ) : twitter.linked ? (
              <div className="flex items-center gap-3">
                <a
                  href={`https://x.com/${twitter.twitterUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 hover:bg-gray-200 transition"
                >
                  {twitter.twitterAvatar && (
                    <img
                      src={twitter.twitterAvatar}
                      alt=""
                      className="w-8 h-8 rounded-full"
                    />
                  )}
                  <span className="text-gray-600 text-sm font-medium">
                    @{twitter.twitterUsername}
                  </span>
                </a>
                {twitter.twitterScore !== null && twitter.twitterScore !== undefined && (
                  <div className="rounded-lg bg-gray-100 px-3 py-2 text-center">
                    <p className="text-gray-900 font-bold text-sm">{twitter.twitterScore}</p>
                    <p className="text-gray-400 text-xs">Score</p>
                  </div>
                )}
              </div>
            ) : isOwnProfile ? (
              <a
                href={`${AUTH_URL}/api/auth/twitter?wallet=${address}`}
                className="rounded-lg bg-gray-900 px-4 py-2 text-white text-sm font-medium hover:bg-gray-800 transition"
              >
                Connect Twitter
              </a>
            ) : (
              <span className="text-gray-400 text-sm">No Twitter linked</span>
            )}
          </div>
        </div>

        {/* Stats from backend */}
        {stats && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            {/* Creator stats */}
            {stats.campaigns_created > 0 && (
              <div className="mb-4">
                <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-3">As Creator</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-900">{stats.campaigns_created}</p>
                    <p className="text-xs text-gray-400 mt-1">Campaigns</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-900">
                      {fmt(Number(stats.creator_total_raised), 2)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Total Raised</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-2xl font-bold ${creatorPnl >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {creatorPnl >= 0 ? "+" : ""}{fmt(creatorPnl, 2)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Campaigns PnL</p>
                  </div>
                </div>
              </div>
            )}

            {/* Investor stats */}
            {stats.campaigns_invested > 0 && (
              <div className={stats.campaigns_created > 0 ? "pt-4 border-t border-gray-200" : ""}>
                <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-3">As Investor</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-900">{stats.campaigns_invested}</p>
                    <p className="text-xs text-gray-400 mt-1">Investments</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-900">
                      {fmt(Number(stats.investor_total_deposited), 2)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Total Deposited</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-2xl font-bold ${investorPnl >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {investorPnl >= 0 ? "+" : ""}{fmt(investorPnl, 2)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Invests PnL</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Unclaimed funds */}
      {isOwnProfile && claimableItems.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Unclaimed Funds</h3>
          <div className="space-y-2">
            {claimableItems.map((item) => (
              <ClaimRow
                key={item.campaignAddress}
                item={item}
                onClaimed={() => { refetchCampaigns(); setTimeout(fetchStats, 3000); }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Campaigns by this creator</h2>
        {isOwnProfile && (
          <Link
            href="/create"
            className="rounded-lg bg-gray-900 px-4 py-2 text-white text-sm font-medium hover:bg-gray-800 transition"
          >
            Create Campaign
          </Link>
        )}
      </div>

      <div className="space-y-3">
        {creatorCampaigns.length === 0 && (
          <p className="text-gray-400 text-sm">No campaigns found.</p>
        )}
        {creatorCampaigns.map((c) => (
          <Link key={c.address} href={`/campaign/${c.address}`} className="block">
            <div className="rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300 transition">
              <div className="flex items-center justify-between">
                <span className="text-gray-900 font-mono text-sm">
                  {c.address.slice(0, 6)}...{c.address.slice(-4)}
                </span>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${c.withdrawnAt > 0n ? "bg-gray-300 text-gray-600" : "bg-gray-900 text-white"}`}
                >
                  {c.withdrawnAt > 0n ? "Closed" : "Active"}
                </span>
              </div>
              <div className="text-sm text-gray-500 mt-1">
                {fmtToken(c.totalRaised, c.tokenDecimals)} {c.tokenSymbol} raised
                {c.returnedAmount > 0n && (
                  <span className="text-amber-600 ml-2">
                    ({fmtToken(c.returnedAmount, c.tokenDecimals)} returned)
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ClaimRow({
  item,
  onClaimed,
}: {
  item: { campaignAddress: `0x${string}`; claimable: bigint; tokenSymbol: string; tokenDecimals: number };
  onClaimed: () => void;
}) {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) onClaimed();
  }, [isSuccess, onClaimed]);

  function handleClaim() {
    writeContract({
      address: item.campaignAddress,
      abi: CAMPAIGN_ABI,
      functionName: "claim",
    });
  }

  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-100 px-4 py-3">
      <div>
        <Link
          href={`/campaign/${item.campaignAddress}`}
          className="text-gray-600 hover:text-gray-900 hover:underline font-mono text-sm"
        >
          {item.campaignAddress.slice(0, 6)}...{item.campaignAddress.slice(-4)}
        </Link>
        <p className="text-green-600 text-sm mt-0.5">
          {fmtToken(item.claimable, item.tokenDecimals)} {item.tokenSymbol}
        </p>
      </div>
      {isSuccess ? (
        <span className="text-green-600 text-sm">Claimed!</span>
      ) : (
        <button
          onClick={handleClaim}
          disabled={isPending || isConfirming}
          className="rounded-lg bg-green-600 px-4 py-1.5 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {isPending ? "Confirm..." : isConfirming ? "Claiming..." : "Claim"}
        </button>
      )}
    </div>
  );
}

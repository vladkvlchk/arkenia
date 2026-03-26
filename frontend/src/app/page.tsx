"use client";

import { useEffect, useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { FACTORY_ABI, CAMPAIGN_ABI, ERC20_ABI } from "@/lib/abi";
import { FACTORY_ADDRESS, API_URL } from "@/lib/config";
import { CampaignCard } from "@/components/CampaignCard";

interface CampaignMeta {
  campaign: string;
  name: string;
  description: string;
  logo_url: string;
  cover_url: string;
  created_at: string;
}

export default function HomePage() {
  const [metaMap, setMetaMap] = useState<Map<string, CampaignMeta>>(new Map());

  const { data: campaigns } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: "getCampaigns",
  });

  const campaignAddresses = campaigns ?? [];

  useEffect(() => {
    fetch(`${API_URL}/api/stats/campaigns/meta`)
      .then((r) => r.json())
      .then((data: CampaignMeta[]) => {
        const map = new Map<string, CampaignMeta>();
        for (const m of data) {
          map.set(m.campaign.toLowerCase(), m);
        }
        setMetaMap(map);
      })
      .catch(() => {});
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Active Campaigns</h1>
        <p className="text-gray-500">
          Browse fundraising campaigns. All funds held in smart contract escrow.
        </p>
      </div>

      {campaignAddresses.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No campaigns yet.</p>
          <p className="text-sm mt-1">Be the first to create one!</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {campaignAddresses.map((addr) => (
            <CampaignItem
              key={addr}
              address={addr}
              meta={metaMap.get(addr.toLowerCase())}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignItem({
  address,
  meta,
}: {
  address: `0x${string}`;
  meta?: CampaignMeta;
}) {
  const { data: results } = useReadContracts({
    contracts: [
      { address, abi: CAMPAIGN_ABI, functionName: "creator" },
      { address, abi: CAMPAIGN_ABI, functionName: "floor" },
      { address, abi: CAMPAIGN_ABI, functionName: "ceil" },
      { address, abi: CAMPAIGN_ABI, functionName: "totalRaised" },
      { address, abi: CAMPAIGN_ABI, functionName: "token" },
      { address, abi: CAMPAIGN_ABI, functionName: "withdrawnAt" },
    ],
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

  if (
    !results ||
    results.some((r) => r.status !== "success") ||
    !tokenResults ||
    tokenResults.length < 2 ||
    tokenResults.some((r) => r.status !== "success")
  ) {
    return <div className="rounded-xl border border-gray-200 bg-white p-5 animate-pulse h-40" />;
  }

  return (
    <CampaignCard
      address={address}
      creator={results[0].result as string}
      floor={results[1].result as bigint}
      ceil={results[2].result as bigint}
      totalRaised={results[3].result as bigint}
      tokenSymbol={tokenResults[0]!.result as string}
      tokenDecimals={tokenResults[1]!.result as number}
      withdrawnAt={results[5].result as bigint}
      name={meta?.name}
      coverUrl={meta?.cover_url}
      createdAt={meta?.created_at}
    />
  );
}

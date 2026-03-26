"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatUnits } from "viem";
import { API_URL } from "@/lib/config";
import { fmt } from "@/lib/fmt";

interface CampaignEvent {
  id: number;
  tx_hash: string;
  block_number: string;
  event_name: string;
  args: {
    investor?: string;
    creator?: string;
    amount?: string;
    timestamp?: string;
  };
  indexed_at: string;
}

const EVENT_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  Deposited: { label: "Deposit", color: "text-green-600", icon: "+" },
  Withdrawn: { label: "Withdraw", color: "text-gray-500", icon: "\u2191" },
  Refunded: { label: "Refund", color: "text-red-500", icon: "\u21a9" },
  FundsReturned: { label: "Return", color: "text-gray-500", icon: "\u21bb" },
  Claimed: { label: "Claim", color: "text-gray-500", icon: "\u2713" },
};

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function ActivityFeed({
  campaignAddress,
  tokenSymbol,
  tokenDecimals,
}: {
  campaignAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
}) {
  const [events, setEvents] = useState<CampaignEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/stats/campaign/${campaignAddress}/events`);
      if (res.ok) setEvents(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [campaignAddress]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Show newest first
  const sorted = [...events].reverse();

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity</h3>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : sorted.length === 0 ? (
        <p className="text-gray-400 text-sm">No activity yet</p>
      ) : (
        <div className="space-y-0 divide-y divide-gray-200">
          {sorted.map((ev) => {
            const cfg = EVENT_CONFIG[ev.event_name] || {
              label: ev.event_name,
              color: "text-gray-500",
              icon: "?",
            };
            const wallet = ev.args.investor || ev.args.creator;
            const amount = ev.args.amount
              ? fmt(Number(formatUnits(BigInt(ev.args.amount), tokenDecimals)), 2)
              : null;

            return (
              <div key={ev.id} className="flex items-center gap-3 py-2.5">
                <span className={`text-lg w-6 text-center ${cfg.color}`}>{cfg.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
                    {wallet && (
                      <Link
                        href={`/profile/${wallet}`}
                        className="text-gray-500 hover:text-gray-900 font-mono text-xs transition"
                      >
                        {shortAddr(wallet)}
                      </Link>
                    )}
                  </div>
                </div>
                {amount && (
                  <span className="text-gray-900 text-sm font-medium whitespace-nowrap">
                    {amount} {tokenSymbol}
                  </span>
                )}
                <a
                  href={`https://sepolia.etherscan.io/tx/${ev.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-gray-600 text-xs transition shrink-0"
                  title={ev.tx_hash}
                >
                  {timeAgo(ev.indexed_at)}
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { formatUnits } from "viem";
import { fmt, fmtToken } from "@/lib/fmt";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const month = MONTHS[d.getMonth()];
  if (d.getFullYear() !== now.getFullYear()) {
    return `${month} ${d.getFullYear()}`;
  }
  return `${d.getDate()} ${month}`;
}

interface Props {
  address: string;
  creator: string;
  floor: bigint;
  ceil: bigint;
  totalRaised: bigint;
  tokenSymbol: string;
  tokenDecimals: number;
  withdrawnAt: bigint;
  name?: string;
  coverUrl?: string;
  createdAt?: string;
}

export function CampaignCard({
  address,
  creator,
  floor,
  ceil,
  totalRaised,
  tokenSymbol,
  tokenDecimals,
  withdrawnAt,
  name,
  coverUrl,
  createdAt,
}: Props) {
  const raised = Number(formatUnits(totalRaised, tokenDecimals));
  const ceilNum = Number(formatUnits(ceil, tokenDecimals));
  const floorNum = Number(formatUnits(floor, tokenDecimals));
  const progress = ceilNum > 0 ? Math.min((raised / ceilNum) * 100, 100) : 0;
  const isClosed = withdrawnAt > 0n;

  return (
    <Link href={`/campaign/${address}`}>
      <div className="rounded-xl border border-gray-200 bg-white hover:border-gray-300 transition cursor-pointer overflow-hidden">
        {/* Cover + overlapping logo */}
        <div className="relative">
          {/* Cover banner */}
          <div className="h-24 bg-gray-100">
            {coverUrl && (
              <img src={coverUrl} alt="" className="w-full h-full object-cover" />
            )}
          </div>

          {/* Badges — top-right on cover */}
          <div className="absolute top-2 right-2 flex items-center gap-1.5">
            {createdAt && (
              <span className="text-xs px-2 py-1 rounded-full bg-white/70 text-gray-600">
                {fmtDate(createdAt)}
              </span>
            )}
            <span
              className={`text-xs px-2 py-1 rounded-full ${isClosed ? "bg-gray-300 text-gray-600" : "bg-gray-900 text-white"}`}
            >
              {isClosed ? "Closed" : "Active"}
            </span>
          </div>

        </div>

        <div className="px-5 pb-4 pt-3">
          <h3 className="text-gray-900 font-semibold truncate mb-0.5">
            {name || `${address.slice(0, 6)}...${address.slice(-4)}`}
          </h3>
          {name && (
            <p className="text-xs text-gray-400 font-mono mb-3">
              {address.slice(0, 6)}...{address.slice(-4)}
            </p>
          )}
          {!name && <div className="mb-3" />}

          <div className="mb-3">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">
                {fmt(raised, 2)} {tokenSymbol} raised
              </span>
              {ceilNum > 0 && (
                <span className="text-gray-400">{progress.toFixed(0)}%</span>
              )}
            </div>
            {ceilNum > 0 && (
              <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
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
          </div>

          <div className="flex justify-between text-xs text-gray-400">
            {floorNum > 0 && (
              <span>
                Floor: {fmt(floorNum, 2)} {tokenSymbol}
              </span>
            )}
            {ceilNum > 0 && (
              <span>
                Ceil: {fmt(ceilNum, 2)} {tokenSymbol}
              </span>
            )}
          </div>
          <div className="mt-2 text-xs text-gray-400 truncate">
            by{" "}
            <Link
              href={`/profile/${creator}`}
              onClick={(e) => e.stopPropagation()}
              className="text-gray-600 hover:text-gray-900 hover:underline"
            >
              {creator.slice(0, 6)}...{creator.slice(-4)}
            </Link>
          </div>
        </div>
      </div>
    </Link>
  );
}

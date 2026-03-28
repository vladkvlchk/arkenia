"use client";

import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";

export function Navbar() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { address } = useAccount();

  const shortAddress = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : null;

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-xl font-bold text-gray-900">
            Arkenia
          </Link>
          <div className="flex gap-4">
            <Link href="/" className="text-gray-500 hover:text-gray-900 transition">
              Campaigns
            </Link>
            <Link href="/creators" className="text-gray-500 hover:text-gray-900 transition">
              Creators
            </Link>
            <Link href="/profile/me" className="text-gray-500 hover:text-gray-900 transition">
              My Profile
            </Link>
          </div>
        </div>
        {ready && (
          authenticated ? (
            <button
              onClick={logout}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              {shortAddress ?? "Disconnect"}
            </button>
          ) : (
            <button
              onClick={login}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition"
            >
              Connect Wallet
            </button>
          )
        )}
      </div>
    </nav>
  );
}

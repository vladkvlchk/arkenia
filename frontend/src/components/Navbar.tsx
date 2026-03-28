"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";

export function Navbar() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { address } = useAccount();
  const router = useRouter();

  const shortAddress = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : null;

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-xl text-gray-900" style={{ fontFamily: "var(--font-baskervville), serif" }}>
            Arkenia
          </Link>
          <div className="flex gap-4">
            <Link href="/" className="text-gray-500 hover:text-gray-900 transition">
              Campaigns
            </Link>
            <Link href="/creators" className="text-gray-500 hover:text-gray-900 transition">
              Creators
            </Link>
          </div>
        </div>
        {ready && (
          authenticated ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => router.push("/profile/me")}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                {shortAddress ?? "My Profile"}
              </button>
              <button
                onClick={logout}
                title="Disconnect"
                className="rounded-lg border border-gray-200 p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
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

"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export function Navbar() {
  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-xl font-bold text-gray-900">
            Aurelia
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
        <ConnectButton />
      </div>
    </nav>
  );
}

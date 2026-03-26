"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/config";

interface Profile {
  wallet: string;
  twitter_username: string;
  twitter_avatar: string;
  linked_at: string;
}

export default function CreatorsPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading(true);
      fetch(`${API_URL}/api/auth/profiles?q=${encodeURIComponent(search)}`)
        .then((r) => r.json())
        .then(setProfiles)
        .catch(() => setProfiles([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Creators</h1>

      <input
        type="text"
        placeholder="Search by @username or wallet address..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg bg-white border border-gray-200 px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 mb-6"
      />

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : profiles.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          {search ? "No creators found." : "No creators have linked Twitter yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {profiles.map((p) => (
            <Link key={p.wallet} href={`/profile/${p.wallet}`} className="block">
              <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-300 transition">
                {p.twitter_avatar ? (
                  <img
                    src={p.twitter_avatar}
                    alt=""
                    className="w-10 h-10 rounded-full"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-200" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 font-medium">
                    @{p.twitter_username}
                  </p>
                  <p className="text-gray-400 text-xs font-mono truncate">
                    {p.wallet}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

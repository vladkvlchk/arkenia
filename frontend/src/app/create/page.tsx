"use client";

import { useEffect, useRef, useState } from "react";
import { parseUnits } from "viem";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { FACTORY_ABI } from "@/lib/abi";
import { FACTORY_ADDRESS, API_URL } from "@/lib/config";
import { useRouter } from "next/navigation";

const TOKENS = [
  {
    symbol: "USDC",
    address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" as `0x${string}`,
    decimals: 6,
    logo: "https://assets.coingecko.com/coins/images/6319/small/usdc.png",
  },
];

export default function CreatePage() {
  const { address, isConnected } = useAccount();
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [floorAmount, setFloorAmount] = useState("");
  const [ceilAmount, setCeilAmount] = useState("");
  const [selectedToken] = useState(TOKENS[0]);
  const [metaSaved, setMetaSaved] = useState(false);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash });

  function handleFilePreview(file: File | undefined, setter: (url: string | null) => void) {
    if (!file) return;
    setter(URL.createObjectURL(file));
  }

  useEffect(() => {
    if (!isSuccess || !receipt || metaSaved) return;

    const createdLog = receipt.logs.find(
      (log) => log.address.toLowerCase() === FACTORY_ADDRESS.toLowerCase()
    );

    if (createdLog && createdLog.topics[1]) {
      const campaignAddress = "0x" + createdLog.topics[1].slice(26);

      const formData = new FormData();
      formData.append("creator", address || "");
      formData.append("name", name || "Untitled Campaign");
      formData.append("description", description);

      const coverFile = coverRef.current?.files?.[0];
      if (coverFile) formData.append("cover", coverFile);

      fetch(`${API_URL}/api/stats/campaign/${campaignAddress}/meta`, {
        method: "POST",
        body: formData,
      })
        .then(() => {
          setMetaSaved(true);
          router.push(`/campaign/${campaignAddress}`);
        })
        .catch(console.error);
    }
  }, [isSuccess, receipt, metaSaved, address, name, description, router]);

  function handleCreate() {
    if (!name.trim()) return;
    const floor = floorAmount ? parseUnits(floorAmount, selectedToken.decimals) : 0n;
    const ceil = ceilAmount ? parseUnits(ceilAmount, selectedToken.decimals) : 0n;
    writeContract({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: "createCampaign",
      args: [floor, ceil, selectedToken.address],
    });
  }

  if (!isConnected) {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-bold mb-2">Create Campaign</h1>
        <p className="text-gray-500">Connect your wallet to create a campaign.</p>
      </div>
    );
  }

  const tokenInline = (
    <div className="flex items-center gap-1.5 shrink-0 pr-1">
      <img src={selectedToken.logo} alt={selectedToken.symbol} className="w-4 h-4 rounded-full" />
      <span className="text-sm font-medium text-gray-700">{selectedToken.symbol}</span>
      <a
        href={`https://basescan.org/token/${selectedToken.address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-gray-400 hover:text-gray-600 transition"
        title="View on Basescan"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </a>
    </div>
  );

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Create Campaign</h1>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold mb-4">Campaign Details</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-500 mb-1">Campaign Name *</label>
            <input
              type="text"
              placeholder="e.g. DeFi Yield Strategy Q1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">Description</label>
            <textarea
              placeholder="Describe your campaign — what you'll do with the funds, expected returns, timeline..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">Cover Image</label>
            <div
              onClick={() => coverRef.current?.click()}
              className="relative w-full aspect-[3/1] rounded-lg bg-gray-100 border border-gray-200 border-dashed flex items-center justify-center cursor-pointer hover:border-gray-400 transition overflow-hidden"
            >
              {coverPreview ? (
                <img src={coverPreview} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-gray-400 text-sm text-center px-2">Click to upload cover</span>
              )}
            </div>
            <input
              ref={coverRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFilePreview(e.target.files?.[0], setCoverPreview)}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">Min to raise <span className="text-gray-400">(0 = no minimum)</span></label>
            <div className="flex items-center gap-2 rounded-lg bg-gray-100 border border-gray-200 px-3 focus-within:border-gray-900">
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0"
                value={floorAmount}
                onChange={(e) => setFloorAmount(e.target.value)}
                className="flex-1 bg-transparent py-2 text-gray-900 placeholder-gray-400 focus:outline-none"
              />
              {tokenInline}
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">Max to raise <span className="text-gray-400">(0 = unlimited)</span></label>
            <div className="flex items-center gap-2 rounded-lg bg-gray-100 border border-gray-200 px-3 focus-within:border-gray-900">
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0"
                value={ceilAmount}
                onChange={(e) => setCeilAmount(e.target.value)}
                className="flex-1 bg-transparent py-2 text-gray-900 placeholder-gray-400 focus:outline-none"
              />
              {tokenInline}
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={isPending || isConfirming || !name.trim()}
            className="w-full rounded-lg bg-gray-900 py-3 text-white font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isPending ? "Confirm in wallet..." : isConfirming ? "Creating..." : "Create Campaign"}
          </button>

          {isSuccess && (
            <p className="text-green-600 text-sm text-center">Campaign created! Redirecting...</p>
          )}
        </div>
      </div>
    </div>
  );
}

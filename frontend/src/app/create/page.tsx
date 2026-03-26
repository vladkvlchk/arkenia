"use client";

import { useEffect, useRef, useState } from "react";
import { parseUnits } from "viem";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from "wagmi";
import { FACTORY_ABI, ERC20_ABI } from "@/lib/abi";
import { FACTORY_ADDRESS, API_URL } from "@/lib/config";
import { useRouter } from "next/navigation";

const USDC_SEPOLIA = "0x16F1A20989b833Fd66b233d1Ae1eFD70F3004446";

export default function CreatePage() {
  const { address, isConnected } = useAccount();
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [floorAmount, setFloorAmount] = useState("");
  const [ceilAmount, setCeilAmount] = useState("");
  const [tokenAddress, setTokenAddress] = useState(USDC_SEPOLIA);
  const [metaSaved, setMetaSaved] = useState(false);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const { data: isAllowed } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: "allowedTokens",
    args: [tokenAddress as `0x${string}`],
  });

  const { data: tokenSymbol } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "symbol",
  });

  const { data: tokenDecimals } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "decimals",
  });

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash });

  const decimals = tokenDecimals ?? 6;

  function handleFilePreview(
    file: File | undefined,
    setter: (url: string | null) => void
  ) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setter(url);
  }

  // After tx confirmed, save metadata and redirect
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
    if (!tokenAddress || !name.trim()) return;
    const floor = floorAmount ? parseUnits(floorAmount, decimals) : 0n;
    const ceil = ceilAmount ? parseUnits(ceilAmount, decimals) : 0n;
    writeContract({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: "createCampaign",
      args: [floor, ceil, tokenAddress as `0x${string}`],
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

          {/* Cover image upload */}
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
            <label className="block text-sm text-gray-500 mb-1">Token Address</label>
            <input
              type="text"
              placeholder="0x..."
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
              className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 font-mono text-sm"
            />
            {tokenSymbol && (
              <p className="text-xs text-gray-400 mt-1">
                Token: {tokenSymbol} ({decimals} decimals)
                {isAllowed === false && (
                  <span className="text-red-500 ml-2">Not whitelisted on factory</span>
                )}
                {isAllowed === true && (
                  <span className="text-green-600 ml-2">Whitelisted</span>
                )}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">
              Floor ({tokenSymbol || "tokens"}) — minimum to raise (0 = no minimum)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              value={floorAmount}
              onChange={(e) => setFloorAmount(e.target.value)}
              className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">
              Ceil ({tokenSymbol || "tokens"}) — max to raise (0 = unlimited)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              value={ceilAmount}
              onChange={(e) => setCeilAmount(e.target.value)}
              className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900"
            />
          </div>

          <button
            onClick={handleCreate}
            disabled={isPending || isConfirming || !tokenAddress || isAllowed === false || !name.trim()}
            className="w-full rounded-lg bg-gray-900 py-3 text-white font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isPending ? "Confirm in wallet..." : isConfirming ? "Creating..." : "Create Campaign"}
          </button>

          {isSuccess && (
            <p className="text-green-600 text-sm text-center">
              Campaign created! Redirecting...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

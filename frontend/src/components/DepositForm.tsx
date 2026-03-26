"use client";

import { useEffect, useState } from "react";
import { parseUnits } from "viem";
import { fmtToken } from "@/lib/fmt";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { CAMPAIGN_ABI, ERC20_ABI } from "@/lib/abi";

interface Props {
  campaignAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
  tokenSymbol: string;
  tokenDecimals: number;
  onDeposited?: () => void;
  refund?: {
    maxAmount: bigint;
  };
}

type Tab = "deposit" | "refund";

export function DepositForm({
  campaignAddress,
  tokenAddress,
  tokenSymbol,
  tokenDecimals,
  onDeposited,
  refund,
}: Props) {
  const { address } = useAccount();
  const [tab, setTab] = useState<Tab>("deposit");
  const [amount, setAmount] = useState("");

  // Reset amount when switching tabs
  useEffect(() => {
    setAmount("");
  }, [tab]);

  // --- Deposit logic ---
  const { data: balance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, campaignAddress] : undefined,
  });

  const {
    writeContract: approve,
    data: approveHash,
    isPending: approvePending,
  } = useWriteContract();
  const { isLoading: approveConfirming, isSuccess: approveSuccess } =
    useWaitForTransactionReceipt({
      hash: approveHash,
      query: { enabled: !!approveHash },
    });

  const {
    writeContract: deposit,
    data: depositHash,
    isPending: depositPending,
  } = useWriteContract();
  const { isLoading: depositConfirming, isSuccess: depositSuccess } =
    useWaitForTransactionReceipt({
      hash: depositHash,
      query: { enabled: !!depositHash },
    });

  useEffect(() => {
    if (approveSuccess) refetchAllowance();
  }, [approveSuccess, refetchAllowance]);

  useEffect(() => {
    if (depositSuccess && onDeposited) onDeposited();
  }, [depositSuccess, onDeposited]);

  const parsedAmount = amount ? parseUnits(amount, tokenDecimals) : 0n;
  const needsApproval = allowance !== undefined && parsedAmount > 0n && parsedAmount > allowance;
  const isApproved = allowance !== undefined && parsedAmount > 0n && parsedAmount <= allowance;

  function handleApprove() {
    if (!parsedAmount) return;
    approve({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [campaignAddress, parsedAmount],
    });
  }

  function handleDeposit() {
    if (!parsedAmount) return;
    deposit({
      address: campaignAddress,
      abi: CAMPAIGN_ABI,
      functionName: "deposit",
      args: [parsedAmount],
    });
  }

  const step = !amount || parsedAmount === 0n
    ? 0
    : needsApproval
    ? 1
    : 2;

  // --- Refund logic ---
  const {
    writeContract: refundWrite,
    data: refundHash,
    isPending: refundPending,
  } = useWriteContract();
  const { isLoading: refundConfirming, isSuccess: refundSuccess } =
    useWaitForTransactionReceipt({ hash: refundHash });

  function handleRefund() {
    if (!amount) return;
    refundWrite({
      address: campaignAddress,
      abi: CAMPAIGN_ABI,
      functionName: "refund",
      args: [parseUnits(amount, tokenDecimals)],
    });
  }

  const showTabs = !!refund;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      {/* Tabs */}
      {showTabs ? (
        <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setTab("deposit")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === "deposit"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-600"
            }`}
          >
            Deposit
          </button>
          <button
            onClick={() => setTab("refund")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === "refund"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-600"
            }`}
          >
            Refund
          </button>
        </div>
      ) : (
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Deposit</h3>
      )}

      {tab === "deposit" ? (
        <>
          {balance !== undefined && (
            <p className="text-xs text-gray-400 mb-3">
              Your balance: {fmtToken(balance, tokenDecimals)} {tokenSymbol}
            </p>
          )}

          <div className="mb-4">
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder={`Amount in ${tokenSymbol}`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900"
            />
          </div>

          {/* Steps */}
          <div className="space-y-3">
            {/* Step 1: Approve */}
            <div className={`flex items-center gap-3 rounded-lg p-3 ${
              step === 1 ? "bg-gray-100" : "bg-gray-50"
            }`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                isApproved || approveSuccess ? "bg-green-500 text-white" : step === 1 ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-400"
              }`}>
                {isApproved || approveSuccess ? "\u2713" : "1"}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${step >= 1 || isApproved ? "text-gray-900" : "text-gray-400"}`}>
                  Approve {tokenSymbol}
                </p>
                <p className="text-xs text-gray-400">Allow contract to spend your tokens</p>
              </div>
              {step === 1 && (
                <button
                  onClick={handleApprove}
                  disabled={approvePending || approveConfirming}
                  className="rounded-lg bg-gray-700 px-4 py-1.5 text-white text-sm font-medium hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition shrink-0"
                >
                  {approvePending ? "Confirm..." : approveConfirming ? "Approving..." : "Approve"}
                </button>
              )}
              {(isApproved || approveSuccess) && step !== 1 && (
                <span className="text-green-600 text-xs shrink-0">Approved</span>
              )}
            </div>

            {/* Step 2: Deposit */}
            <div className={`flex items-center gap-3 rounded-lg p-3 ${
              step === 2 ? "bg-gray-100" : "bg-gray-50"
            }`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                depositSuccess ? "bg-green-500 text-white" : step === 2 ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-400"
              }`}>
                {depositSuccess ? "\u2713" : "2"}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${step === 2 || depositSuccess ? "text-gray-900" : "text-gray-400"}`}>
                  Deposit {amount ? `${amount} ${tokenSymbol}` : tokenSymbol}
                </p>
                <p className="text-xs text-gray-400">Send tokens to the campaign</p>
              </div>
              {step === 2 && !depositSuccess && (
                <button
                  onClick={handleDeposit}
                  disabled={depositPending || depositConfirming}
                  className="rounded-lg bg-gray-900 px-4 py-1.5 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition shrink-0"
                >
                  {depositPending ? "Confirm..." : depositConfirming ? "Depositing..." : "Deposit"}
                </button>
              )}
              {depositSuccess && (
                <span className="text-green-600 text-xs shrink-0">Deposited!</span>
              )}
            </div>
          </div>
        </>
      ) : (
        /* Refund tab */
        <>
          {refund && (
            <p className="text-xs text-gray-400 mb-3">
              Max: {fmtToken(refund.maxAmount, tokenDecimals)} {tokenSymbol}
            </p>
          )}
          <div className="flex gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900"
            />
            <button
              onClick={handleRefund}
              disabled={refundPending || refundConfirming || !amount}
              className="rounded-lg bg-gray-700 px-5 py-2 text-white font-medium hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {refundPending ? "Confirm..." : refundConfirming ? "Refunding..." : "Refund"}
            </button>
          </div>
          {refundSuccess && <p className="mt-2 text-sm text-green-600">Refunded!</p>}
        </>
      )}
    </div>
  );
}

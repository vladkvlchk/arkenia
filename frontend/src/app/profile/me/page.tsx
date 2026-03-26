"use client";

import { useAccount } from "wagmi";
import { ProfileView } from "@/components/ProfileView";

export default function MyProfilePage() {
  const { address, isConnected } = useAccount();

  if (!isConnected || !address) {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-bold mb-2">My Profile</h1>
        <p className="text-gray-500">Connect your wallet to view your profile.</p>
      </div>
    );
  }

  return <ProfileView address={address} />;
}

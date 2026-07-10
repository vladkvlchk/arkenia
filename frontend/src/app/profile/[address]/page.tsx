"use client";

import { useParams } from "next/navigation";
import { ProfileScreen } from "@/features/profile/profile-screen";

export default function ProfilePage() {
  const params = useParams();
  return <ProfileScreen address={params.address as string} />;
}

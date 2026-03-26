"use client";

import { useParams } from "next/navigation";
import { ProfileView } from "@/components/ProfileView";

export default function ProfilePage() {
  const params = useParams();
  const address = params.address as string;

  return <ProfileView address={address} />;
}

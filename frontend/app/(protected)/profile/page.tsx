import type { Metadata } from "next";

import { ProfileWorkspace } from "@/components/profile/profile-workspace";

export const metadata: Metadata = {
  title: "Profile | BanglaGuard",
  description:
    "Manage your BanglaGuard profile, account information, profile picture, and password.",
};

export default function ProfilePage() {
  return <ProfileWorkspace />;
}

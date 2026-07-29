"use client";

import {
  LogOut,
} from "lucide-react";
import {
  useRouter,
} from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth-store";

type LogoutButtonProps = {
  className?: string;
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
};

export function LogoutButton({
  className,
  variant = "ghost",
}: LogoutButtonProps) {
  const router = useRouter();

  const logout = useAuthStore(
    (state) => state.logout,
  );

  function handleLogout() {
    logout();

    toast.success("Signed out successfully.");

    router.replace("/auth/login");
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      onClick={handleLogout}
    >
      <LogOut className="size-4" />
      Sign out
    </Button>
  );
}

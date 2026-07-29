"use client";

import { LoaderCircle, ShieldCheck } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  type ReactNode,
  useEffect,
} from "react";

import { useAuthStore } from "@/store/auth-store";

type ProtectedRouteProps = {
  children: ReactNode;
};

export function ProtectedRoute({
  children,
}: ProtectedRouteProps) {
  const router = useRouter();
  const pathname = usePathname();

  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated,
  );

  const isInitializing = useAuthStore(
    (state) => state.isInitializing,
  );

  const user = useAuthStore(
    (state) => state.user,
  );

  useEffect(() => {
    if (isInitializing) {
      return;
    }

    if (!isAuthenticated || !user) {
      const nextPath = encodeURIComponent(
        pathname || "/dashboard",
      );

      router.replace(
        `/auth/login?next=${nextPath}`,
      );
    }
  }, [
    isAuthenticated,
    isInitializing,
    pathname,
    router,
    user,
  ]);

  if (isInitializing) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5">
        <div className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border bg-card shadow-sm">
            <LoaderCircle className="size-6 animate-spin text-emerald-600" />
          </div>

          <p className="mt-5 font-medium">
            Restoring your session
          </p>

          <p className="mt-2 text-sm text-muted-foreground">
            Connecting to your BanglaGuard workspace.
          </p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5">
        <div className="text-center">
          <ShieldCheck className="mx-auto size-9 text-emerald-600" />

          <p className="mt-4 font-medium">
            Authentication required
          </p>

          <p className="mt-2 text-sm text-muted-foreground">
            Redirecting you to the sign-in page.
          </p>
        </div>
      </main>
    );
  }

  return children;
}

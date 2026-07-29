"use client";

import {
  useEffect,
  useRef,
} from "react";

import { useAuthStore } from "@/store/auth-store";

type AuthProviderProps = {
  children: React.ReactNode;
};

export function AuthProvider({
  children,
}: AuthProviderProps) {
  const initialize =
    useAuthStore(
      (state) => state.initialize,
    );

  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) {
      return;
    }

    initializedRef.current = true;

    void initialize();
  }, [initialize]);

  return children;
}

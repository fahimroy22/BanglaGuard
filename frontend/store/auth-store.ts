"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  getCurrentUser,
  loginUser,
  registerUser,
} from "@/lib/auth";

import type {
  LoginRequest,
  RegisterRequest,
  User,
} from "@/types/auth";

const ACCESS_TOKEN_KEY =
  "banglaguard_access_token";

type AuthStore = {
  accessToken: string | null;
  user: User | null;

  isAuthenticated: boolean;
  isInitializing: boolean;
  isLoading: boolean;

  setAccessToken: (
    accessToken: string | null,
  ) => void;

  setUser: (
    user: User | null,
  ) => void;

  login: (
    credentials: LoginRequest,
  ) => Promise<User>;

  register: (
    payload: RegisterRequest,
  ) => Promise<User>;

  initialize: () => Promise<void>;

  logout: () => void;
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      accessToken: null,
      user: null,

      isAuthenticated: false,
      isInitializing: true,
      isLoading: false,

      setAccessToken: (accessToken) => {
        if (typeof window !== "undefined") {
          if (accessToken) {
            window.localStorage.setItem(
              ACCESS_TOKEN_KEY,
              accessToken,
            );
          } else {
            window.localStorage.removeItem(
              ACCESS_TOKEN_KEY,
            );
          }
        }

        set({
          accessToken,
          isAuthenticated: Boolean(accessToken),
        });
      },

      setUser: (user) => {
        set({
          user,
          isAuthenticated: Boolean(
            user && get().accessToken,
          ),
        });
      },

      login: async (credentials) => {
        set({
          isLoading: true,
        });

        try {
          const tokenResponse = await loginUser(
            credentials,
          );

          if (typeof window !== "undefined") {
            window.localStorage.setItem(
              ACCESS_TOKEN_KEY,
              tokenResponse.access_token,
            );
          }

          const authenticatedUser =
            tokenResponse.user ??
            (await getCurrentUser());

          set({
            accessToken:
              tokenResponse.access_token,
            user: authenticatedUser,
            isAuthenticated: true,
          });

          return authenticatedUser;
        } finally {
          set({
            isLoading: false,
          });
        }
      },

      register: async (payload) => {
        set({
          isLoading: true,
        });

        try {
          return await registerUser(payload);
        } finally {
          set({
            isLoading: false,
          });
        }
      },

      initialize: async () => {
        if (typeof window === "undefined") {
          set({
            isInitializing: false,
          });

          return;
        }

        const token =
          window.localStorage.getItem(
            ACCESS_TOKEN_KEY,
          );

        if (!token) {
          set({
            accessToken: null,
            user: null,
            isAuthenticated: false,
            isInitializing: false,
          });

          return;
        }

        set({
          accessToken: token,
          isInitializing: true,
        });

        try {
          const user = await getCurrentUser();

          set({
            user,
            isAuthenticated: true,
          });
        } catch {
          window.localStorage.removeItem(
            ACCESS_TOKEN_KEY,
          );

          set({
            accessToken: null,
            user: null,
            isAuthenticated: false,
          });
        } finally {
          set({
            isInitializing: false,
          });
        }
      },

      logout: () => {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(
            ACCESS_TOKEN_KEY,
          );

          window.localStorage.removeItem(
            "banglaguard_auth",
          );
        }

        set({
          accessToken: null,
          user: null,
          isAuthenticated: false,
          isInitializing: false,
          isLoading: false,
        });
      },
    }),
    {
      name: "banglaguard_auth",

      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
        isAuthenticated:
          state.isAuthenticated,
      }),
    },
  ),
);

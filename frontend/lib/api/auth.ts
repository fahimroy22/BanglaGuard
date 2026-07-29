import { api } from "@/lib/api";

import type {
  LoginRequest,
  RegisterRequest,
  TokenResponse,
  User,
} from "@/types/auth";

export async function loginUser(
  payload: LoginRequest,
): Promise<TokenResponse> {
  const response =
    await api.post<TokenResponse>(
      "/auth/login",
      payload,
    );

  return response.data;
}

export async function registerUser(
  payload: RegisterRequest,
): Promise<User> {
  const response =
    await api.post<User>(
      "/auth/register",
      payload,
    );

  return response.data;
}

export async function getCurrentUser(): Promise<User> {
  const response =
    await api.get<User>(
      "/auth/me",
    );

  return response.data;
}

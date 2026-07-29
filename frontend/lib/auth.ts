import { api } from "@/lib/api";

import type {
  LoginRequest,
  RegisterRequest,
  TokenResponse,
  User,
} from "@/types/auth";

export async function registerUser(
  payload: RegisterRequest,
): Promise<User> {
  const response = await api.post<User>(
    "/auth/register",
    payload,
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  return response.data;
}

export async function loginUser(
  payload: LoginRequest,
): Promise<TokenResponse> {
  const formData = new URLSearchParams();

  formData.set("username", payload.email);
  formData.set("password", payload.password);

  const response = await api.post<TokenResponse>(
    "/auth/login",
    formData,
    {
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
    },
  );

  return response.data;
}

export async function getCurrentUser(): Promise<User> {
  const response = await api.get<User>("/auth/me");

  return response.data;
}

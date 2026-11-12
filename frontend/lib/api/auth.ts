import { api } from "@/lib/api";

import type {
  AvatarUpdateResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
  LoginRequest,
  RegisterRequest,
  TokenResponse,
  UpdateProfileRequest,
  User,
} from "@/types/auth";

export async function loginUser(payload: LoginRequest): Promise<TokenResponse> {
  const response = await api.post<TokenResponse>("/auth/login", payload);

  return response.data;
}

export async function registerUser(payload: RegisterRequest): Promise<User> {
  const response = await api.post<User>("/auth/register", payload);

  return response.data;
}

export async function getCurrentUser(): Promise<User> {
  const response = await api.get<User>("/auth/me");

  return response.data;
}

export async function updateCurrentUser(
  payload: UpdateProfileRequest,
): Promise<User> {
  const response = await api.patch<User>("/auth/me", payload);

  return response.data;
}

export async function changePassword(
  payload: ChangePasswordRequest,
): Promise<ChangePasswordResponse> {
  const response = await api.post<ChangePasswordResponse>(
    "/auth/change-password",
    payload,
  );

  return response.data;
}

export async function getProfileAvatar(): Promise<Blob> {
  const response = await api.get<Blob>("/auth/me/avatar", {
    responseType: "blob",
  });

  return response.data;
}

export async function uploadProfileAvatar(
  file: File,
): Promise<AvatarUpdateResponse> {
  const formData = new FormData();

  formData.append("file", file);

  const response = await api.post<AvatarUpdateResponse>(
    "/auth/me/avatar",
    formData,
  );

  return response.data;
}

export async function removeProfileAvatar(): Promise<AvatarUpdateResponse> {
  const response = await api.delete<AvatarUpdateResponse>("/auth/me/avatar");

  return response.data;
}

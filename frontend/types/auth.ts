export type UserRole = "admin" | "researcher" | "user";

export type User = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type RegisterRequest = {
  full_name: string;
  email: string;
  password: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  user?: User;
};

export type AuthState = {
  accessToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
};

export type ApiErrorResponse = {
  detail?: string;
  message?: string;
  error?: string;
};

export type UpdateProfileRequest = {
  full_name?: string;
  email?: string;
};

export type ChangePasswordRequest = {
  current_password: string;
  new_password: string;
};

export type ChangePasswordResponse = {
  message: string;
};

export type AvatarUpdateResponse = {
  message: string;
  has_avatar: boolean;
};

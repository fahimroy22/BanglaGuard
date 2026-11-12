"use client";

import axios from "axios";
import {
  Camera,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import {
  changePassword,
  getProfileAvatar,
  removeProfileAvatar,
  updateCurrentUser,
  uploadProfileAvatar,
} from "@/lib/api/auth";
import { notifyProfileAvatarChanged } from "@/hooks/use-profile-avatar";
import { useAuthStore } from "@/store/auth-store";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

function getInitials(name?: string | null): string {
  if (!name?.trim()) {
    return "BG";
  }

  const parts = name.trim().split(/\s+/).filter(Boolean);

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatRole(role?: string | null): string {
  if (!role) {
    return "User";
  }

  return role
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatMemberSince(value?: string): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
  }).format(date);
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;

    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
  }

  return fallback;
}

export function ProfileWorkspace() {
  const user = useAuthStore((state) => state.user);

  const setUser = useAuthStore((state) => state.setUser);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(() => user?.full_name ?? "");

  const [email, setEmail] = useState(() => user?.email ?? "");

  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");

  const [newPassword, setNewPassword] = useState("");

  const [confirmPassword, setConfirmPassword] = useState("");

  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const avatarUrlRef = useRef<string | null>(null);

  const [isLoadingAvatar, setIsLoadingAvatar] = useState(true);

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const [isRemovingAvatar, setIsRemovingAvatar] = useState(false);

  const replaceAvatarUrl = useCallback((nextUrl: string | null) => {
    if (avatarUrlRef.current) {
      URL.revokeObjectURL(avatarUrlRef.current);
    }

    avatarUrlRef.current = nextUrl;
    setAvatarUrl(nextUrl);
  }, []);

  const loadAvatar = useCallback(async () => {
    setIsLoadingAvatar(true);

    try {
      const blob = await getProfileAvatar();

      const objectUrl = URL.createObjectURL(blob);

      replaceAvatarUrl(objectUrl);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        replaceAvatarUrl(null);
        return;
      }

      replaceAvatarUrl(null);
    } finally {
      setIsLoadingAvatar(false);
    }
  }, [replaceAvatarUrl]);

  useEffect(() => {
    let cancelled = false;

    async function initializeAvatar() {
      try {
        const blob = await getProfileAvatar();

        if (cancelled) {
          return;
        }

        const objectUrl = URL.createObjectURL(blob);

        replaceAvatarUrl(objectUrl);
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (axios.isAxiosError(error) && error.response?.status === 404) {
          replaceAvatarUrl(null);
          return;
        }

        replaceAvatarUrl(null);
      } finally {
        if (!cancelled) {
          setIsLoadingAvatar(false);
        }
      }
    }

    void initializeAvatar();

    return () => {
      cancelled = true;

      if (avatarUrlRef.current) {
        URL.revokeObjectURL(avatarUrlRef.current);

        avatarUrlRef.current = null;
      }
    };
  }, [replaceAvatarUrl]);

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedName = fullName.trim();

    const normalizedEmail = email.trim();

    if (normalizedName.length < 2) {
      toast.error("Full name must contain at least 2 characters.");
      return;
    }

    if (!normalizedEmail) {
      toast.error("Email address is required.");
      return;
    }

    setIsSavingProfile(true);

    try {
      const updatedUser = await updateCurrentUser({
        full_name: normalizedName,
        email: normalizedEmail,
      });

      setUser(updatedUser);

      toast.success("Profile updated successfully.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Unable to update your profile."));
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentPassword) {
      toast.error("Enter your current password.");
      return;
    }

    if (newPassword.length < 8 || newPassword.length > 128) {
      toast.error("New password must be between 8 and 128 characters.");
      return;
    }

    if (!/[A-Z]/.test(newPassword)) {
      toast.error("New password must include an uppercase letter.");
      return;
    }

    if (!/[a-z]/.test(newPassword)) {
      toast.error("New password must include a lowercase letter.");
      return;
    }

    if (!/[0-9]/.test(newPassword)) {
      toast.error("New password must include a number.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }

    setIsChangingPassword(true);

    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      toast.success("Password changed successfully.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Unable to change your password."));
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      toast.error("Choose a JPEG, PNG, or WebP image.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Profile picture must be 5 MB or smaller.");
      return;
    }

    setIsUploadingAvatar(true);

    try {
      await uploadProfileAvatar(file);
      await loadAvatar();

      notifyProfileAvatarChanged();

      toast.success("Profile picture updated.");
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, "Unable to upload profile picture."),
      );
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  async function handleRemoveAvatar() {
    setIsRemovingAvatar(true);

    try {
      await removeProfileAvatar();

      replaceAvatarUrl(null);

      notifyProfileAvatarChanged();

      toast.success("Profile picture removed.");
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, "Unable to remove profile picture."),
      );
    } finally {
      setIsRemovingAvatar(false);
    }
  }

  if (!user) {
    return (
      <div className="workspace-container">
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Loading account information…
          </CardContent>
        </Card>
      </div>
    );
  }

  const profileChanged =
    fullName.trim() !== user.full_name || email.trim() !== user.email;

  return (
    <main className="workspace-container space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Profile</h1>

        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account information, profile picture, and password.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <Avatar className="h-24 w-24 border">
                  {avatarUrl ? (
                    <AvatarImage
                      src={avatarUrl}
                      alt={`${user.full_name} profile`}
                    />
                  ) : null}

                  <AvatarFallback className="text-xl font-semibold">
                    {isLoadingAvatar ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      getInitials(user.full_name)
                    )}
                  </AvatarFallback>
                </Avatar>

                <h2 className="mt-4 text-base font-semibold">
                  {user.full_name}
                </h2>

                <p className="mt-1 break-all text-sm text-muted-foreground">
                  {user.email}
                </p>

                <Badge variant="secondary" className="mt-3">
                  {formatRole(user.role)}
                </Badge>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleAvatarChange}
                />

                <div className="mt-5 flex w-full gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    disabled={isUploadingAvatar || isRemovingAvatar}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isUploadingAvatar ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Camera />
                    )}

                    {avatarUrl ? "Replace" : "Upload"}
                  </Button>

                  {avatarUrl ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Remove profile picture"
                      disabled={isUploadingAvatar || isRemovingAvatar}
                      onClick={handleRemoveAvatar}
                    >
                      {isRemovingAvatar ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Trash2 />
                      )}
                    </Button>
                  ) : null}
                </div>

                <p className="mt-3 text-xs text-muted-foreground">
                  JPEG, PNG, or WebP. Maximum 5 MB.
                </p>
              </div>

              <Separator className="my-5" />

              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Status</span>

                  <span className="flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    {user.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Member since</span>

                  <span className="font-medium">
                    {formatMemberSince(user.created_at)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <UserRound className="h-4 w-4" />

                <CardTitle>Account information</CardTitle>
              </div>

              <CardDescription>
                Update the basic information associated with your account.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form className="space-y-4" onSubmit={handleProfileSubmit}>
                <div className="space-y-2">
                  <label
                    htmlFor="profile-full-name"
                    className="text-sm font-medium"
                  >
                    Full name
                  </label>

                  <Input
                    id="profile-full-name"
                    value={fullName}
                    maxLength={150}
                    autoComplete="name"
                    onChange={(event) => setFullName(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="profile-email"
                    className="text-sm font-medium"
                  >
                    Email address
                  </label>

                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                    <Input
                      id="profile-email"
                      type="email"
                      value={email}
                      autoComplete="email"
                      className="pl-9"
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={isSavingProfile || !profileChanged}
                  >
                    {isSavingProfile ? (
                      <Loader2 className="animate-spin" />
                    ) : null}
                    Save changes
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />

                <CardTitle>Security</CardTitle>
              </div>

              <CardDescription>
                Change your password using your current account password.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form className="space-y-4" onSubmit={handlePasswordSubmit}>
                <div className="space-y-2">
                  <label
                    htmlFor="current-password"
                    className="text-sm font-medium"
                  >
                    Current password
                  </label>

                  <Input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    autoComplete="current-password"
                    onChange={(event) => setCurrentPassword(event.target.value)}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label
                      htmlFor="new-password"
                      className="text-sm font-medium"
                    >
                      New password
                    </label>

                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      autoComplete="new-password"
                      onChange={(event) => setNewPassword(event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="confirm-password"
                      className="text-sm font-medium"
                    >
                      Confirm new password
                    </label>

                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      autoComplete="new-password"
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                    />
                  </div>
                </div>

                <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Use 8–128 characters with at least one uppercase letter,
                  lowercase letter, and number.
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={isChangingPassword}>
                    {isChangingPassword ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <KeyRound />
                    )}
                    Change password
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

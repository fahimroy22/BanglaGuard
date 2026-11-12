"use client";

import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";

import { getProfileAvatar } from "@/lib/api/auth";

const PROFILE_AVATAR_CHANGED_EVENT = "banglaguard:profile-avatar-changed";

export function notifyProfileAvatarChanged() {
  window.dispatchEvent(new Event(PROFILE_AVATAR_CHANGED_EVENT));
}

export function useProfileAvatar() {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const avatarUrlRef = useRef<string | null>(null);

  const replaceAvatarUrl = useCallback((nextUrl: string | null) => {
    if (avatarUrlRef.current) {
      URL.revokeObjectURL(avatarUrlRef.current);
    }

    avatarUrlRef.current = nextUrl;
    setAvatarUrl(nextUrl);
  }, []);

  const fetchAvatar = useCallback(async () => {
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
      }
    }

    function handleAvatarChanged() {
      void fetchAvatar();
    }

    void initializeAvatar();

    window.addEventListener(PROFILE_AVATAR_CHANGED_EVENT, handleAvatarChanged);

    return () => {
      cancelled = true;

      window.removeEventListener(
        PROFILE_AVATAR_CHANGED_EVENT,
        handleAvatarChanged,
      );

      if (avatarUrlRef.current) {
        URL.revokeObjectURL(avatarUrlRef.current);

        avatarUrlRef.current = null;
      }
    };
  }, [fetchAvatar, replaceAvatarUrl]);

  return {
    avatarUrl,
  };
}

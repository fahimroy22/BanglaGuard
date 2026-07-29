"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Eye,
  EyeOff,
  LoaderCircle,
} from "lucide-react";
import Link from "next/link";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";
import {
  useEffect,
  useState,
} from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/api";
import {
  loginSchema,
  type LoginFormValues,
} from "@/lib/validators";
import { useAuthStore } from "@/store/auth-store";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const login = useAuthStore(
    (state) => state.login,
  );

  const storeLoading = useAuthStore(
    (state) => state.isLoading,
  );

  const [showPassword, setShowPassword] =
    useState(false);

  const registered =
    searchParams.get("registered") === "1";

  const emailFromQuery =
    searchParams.get("email") ?? "";

  const nextPath =
    searchParams.get("next") ?? "/dashboard";

  const {
    register,
    handleSubmit,
    formState: {
      errors,
      isSubmitting,
    },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: emailFromQuery,
      password: "",
    },
  });

  const loading =
    isSubmitting || storeLoading;

  useEffect(() => {
    if (!registered) {
      return;
    }

    toast.success("Account created successfully.", {
      description:
        "Sign in with your new BanglaGuard account.",
    });
  }, [registered]);

  async function onSubmit(
    values: LoginFormValues,
  ) {
    try {
      const user = await login({
        email: values.email
          .trim()
          .toLowerCase(),
        password: values.password,
      });

      toast.success("Welcome to BanglaGuard.", {
        description: `Signed in as ${user.full_name}.`,
      });

      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      toast.error("Sign-in failed.", {
        description: getApiErrorMessage(
          error,
          "Check your email and password.",
        ),
      });
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-5"
      noValidate
    >
      <div className="space-y-2">
        <label
          htmlFor="email"
          className="text-sm font-medium"
        >
          Email address
        </label>

        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="researcher@example.com"
          aria-invalid={Boolean(errors.email)}
          disabled={loading}
          {...register("email")}
        />

        {errors.email ? (
          <p
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <label
            htmlFor="password"
            className="text-sm font-medium"
          >
            Password
          </label>

          <span className="text-xs text-muted-foreground">
            Secure account access
          </span>
        </div>

        <div className="relative">
          <Input
            id="password"
            type={
              showPassword
                ? "text"
                : "password"
            }
            autoComplete="current-password"
            placeholder="Enter your password"
            className="pr-11"
            aria-invalid={Boolean(
              errors.password,
            )}
            disabled={loading}
            {...register("password")}
          />

          <button
            type="button"
            onClick={() =>
              setShowPassword(
                (current) => !current,
              )
            }
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition hover:text-foreground"
            aria-label={
              showPassword
                ? "Hide password"
                : "Show password"
            }
            disabled={loading}
          >
            {showPassword ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>

        {errors.password ? (
          <p
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.password.message}
          </p>
        ) : null}
      </div>

      <Button
        type="submit"
        className="h-11 w-full"
        disabled={loading}
      >
        {loading ? (
          <>
            <LoaderCircle className="size-4 animate-spin" />
            Signing in
          </>
        ) : (
          "Sign in"
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Do not have an account?{" "}
        <Link
          href="/auth/register"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Create account
        </Link>
      </p>
    </form>
  );
}

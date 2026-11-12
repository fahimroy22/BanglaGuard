"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/api";
import {
  registerSchema,
  type RegisterFormValues,
} from "@/lib/validators";
import { useAuthStore } from "@/store/auth-store";

export function RegisterForm() {
  const router = useRouter();

  const registerUser = useAuthStore(
    (state) => state.register,
  );

  const storeLoading = useAuthStore(
    (state) => state.isLoading,
  );

  const [showPassword, setShowPassword] =
    useState(false);

  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const {
    register,
    handleSubmit,
    formState: {
      errors,
      isSubmitting,
    },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      full_name: "",
      email: "",
      password: "",
      confirm_password: "",
    },
  });

  const loading =
    isSubmitting || storeLoading;

  async function onSubmit(
    values: RegisterFormValues,
  ) {
    try {
      const account = await registerUser({
        full_name: values.full_name.trim(),
        email: values.email.trim().toLowerCase(),
        password: values.password,
      });

      toast.success("Account created successfully.", {
        description:
          account.is_active ? "You can now sign in to BanglaGuard." : "Your account needs administrator approval before you can sign in.",
      });

      router.push(
        `/auth/login?registered=${account.is_active ? "1" : "pending"}&email=${encodeURIComponent(
          values.email.trim().toLowerCase(),
        )}`,
      );
    } catch (error) {
      toast.error("Registration failed.", {
        description: getApiErrorMessage(
          error,
          "Unable to create your account.",
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
          htmlFor="full_name"
          className="text-sm font-medium"
        >
          Full name
        </label>

        <Input
          id="full_name"
          type="text"
          autoComplete="name"
          placeholder="MD. Fahim Ahmed"
          aria-invalid={Boolean(errors.full_name)}
          disabled={loading}
          {...register("full_name")}
        />

        {errors.full_name ? (
          <p
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.full_name.message}
          </p>
        ) : null}
      </div>

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
        <label
          htmlFor="password"
          className="text-sm font-medium"
        >
          Password
        </label>

        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Create a secure password"
            className="pr-11"
            aria-invalid={Boolean(errors.password)}
            disabled={loading}
            {...register("password")}
          />

          <button
            type="button"
            onClick={() =>
              setShowPassword((current) => !current)
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
        ) : (
          <p className="text-xs leading-5 text-muted-foreground">
            Use at least 8 characters with uppercase,
            lowercase, and a number.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="confirm_password"
          className="text-sm font-medium"
        >
          Confirm password
        </label>

        <div className="relative">
          <Input
            id="confirm_password"
            type={
              showConfirmPassword
                ? "text"
                : "password"
            }
            autoComplete="new-password"
            placeholder="Repeat your password"
            className="pr-11"
            aria-invalid={Boolean(
              errors.confirm_password,
            )}
            disabled={loading}
            {...register("confirm_password")}
          />

          <button
            type="button"
            onClick={() =>
              setShowConfirmPassword(
                (current) => !current,
              )
            }
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition hover:text-foreground"
            aria-label={
              showConfirmPassword
                ? "Hide confirmed password"
                : "Show confirmed password"
            }
            disabled={loading}
          >
            {showConfirmPassword ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>

        {errors.confirm_password ? (
          <p
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.confirm_password.message}
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
            Creating account
          </>
        ) : (
          "Create account"
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/auth/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}

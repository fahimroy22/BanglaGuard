import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .email("Enter a valid email address."),

  password: z
    .string()
    .min(1, "Password is required.")
    .min(
      8,
      "Password must contain at least 8 characters.",
    ),
});

export const registerSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(2, "Full name must contain at least 2 characters.")
      .max(
        150,
        "Full name cannot exceed 150 characters.",
      ),

    email: z
      .string()
      .trim()
      .min(1, "Email is required.")
      .email("Enter a valid email address."),

    password: z
      .string()
      .min(
        8,
        "Password must contain at least 8 characters.",
      )
      .max(
        128,
        "Password cannot exceed 128 characters.",
      )
      .regex(
        /[A-Z]/,
        "Password must contain an uppercase letter.",
      )
      .regex(
        /[a-z]/,
        "Password must contain a lowercase letter.",
      )
      .regex(
        /\d/,
        "Password must contain a number.",
      ),

    confirm_password: z
      .string()
      .min(1, "Confirm your password."),
  })
  .refine(
    (data) =>
      data.password === data.confirm_password,
    {
      message: "Passwords do not match.",
      path: ["confirm_password"],
    },
  );

export type LoginFormValues = z.infer<
  typeof loginSchema
>;

export type RegisterFormValues = z.infer<
  typeof registerSchema
>;

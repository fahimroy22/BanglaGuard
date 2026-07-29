import type { Metadata } from "next";
import {
  Suspense,
} from "react";
import Link from "next/link";
import {
  BarChart3,
  BrainCircuit,
  ShieldCheck,
} from "lucide-react";

import { BrandLogo } from "@/components/branding/brand-logo";
import { LoginForm } from "@/components/auth/login-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Sign in | BanglaGuard",
  description:
    "Sign in to your BanglaGuard research account.",
};

const features = [
  {
    icon: BrainCircuit,
    title: "Explainable Bangla analysis",
    description:
      "Access predictions, confidence scores, probabilities, and model explanations.",
  },
  {
    icon: BarChart3,
    title: "Research analytics",
    description:
      "Review model usage, result distributions, latency, and evaluation evidence.",
  },
  {
    icon: ShieldCheck,
    title: "Protected research workspace",
    description:
      "Keep account-level predictions and feedback inside a secured workflow.",
  },
];

function LoginFormFallback() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-11 w-full" />
      </div>

      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-11 w-full" />
      </div>

      <Skeleton className="h-11 w-full" />
      <Skeleton className="mx-auto h-4 w-52" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden border-r bg-muted/30 lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
          <BrandLogo />

          <div className="max-w-xl">
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-400">
              Bangla NLP Research Platform
            </p>

            <h1 className="text-4xl font-bold tracking-tight xl:text-5xl">
              Continue your explainable Bangla NLP research.
            </h1>

            <p className="mt-5 max-w-lg text-lg leading-8 text-muted-foreground">
              Sign in to run predictions, inspect model
              explanations, compare model versions, and
              review human feedback.
            </p>

            <div className="mt-10 space-y-7">
              {features.map((feature) => {
                const Icon = feature.icon;

                return (
                  <div
                    key={feature.title}
                    className="flex gap-4"
                  >
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-background">
                      <Icon className="size-5 text-emerald-600 dark:text-emerald-400" />
                    </div>

                    <div>
                      <h2 className="font-semibold">
                        {feature.title}
                      </h2>

                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <p
            lang="bn"
            className="max-w-lg text-sm leading-7 text-muted-foreground"
          >
            আপনার গবেষণা কর্মক্ষেত্রে প্রবেশ করুন এবং
            বাংলা ভাষার মডেল, পূর্বাভাস, ব্যাখ্যা ও
            মূল্যায়নের কাজ চালিয়ে যান।
          </p>
        </section>

        <section className="flex items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
          <div className="w-full max-w-md">
            <div className="mb-10 flex items-center justify-between lg:hidden">
              <BrandLogo />

              <Link
                href="/"
                className="text-sm text-muted-foreground transition hover:text-foreground"
              >
                Back home
              </Link>
            </div>

            <div className="mb-8">
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                Research workspace
              </p>

              <h2 className="mt-2 text-3xl font-bold tracking-tight">
                Welcome back
              </h2>

              <p className="mt-3 leading-7 text-muted-foreground">
                Sign in to access your BanglaGuard
                research workspace.
              </p>
            </div>

            <Suspense fallback={<LoginFormFallback />}>
              <LoginForm />
            </Suspense>

            <div className="mt-8 text-center">
              <Link
                href="/"
                className="text-sm text-muted-foreground transition hover:text-foreground"
              >
                Return to BanglaGuard
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

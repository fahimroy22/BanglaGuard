import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3,
  BrainCircuit,
  ShieldCheck,
} from "lucide-react";

import { BrandLogo } from "@/components/branding/brand-logo";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Create account | BanglaGuard",
  description:
    "Create a BanglaGuard research-platform account.",
};

const benefits = [
  {
    icon: BrainCircuit,
    title: "Run explainable predictions",
    description:
      "Analyse Bangla hate speech and sentiment with confidence scores and explanations.",
  },
  {
    icon: BarChart3,
    title: "Compare research models",
    description:
      "Evaluate baseline and transformer model results inside one workspace.",
  },
  {
    icon: ShieldCheck,
    title: "Responsible research workflow",
    description:
      "Maintain traceable predictions, feedback, and model evaluation records.",
  },
];

export default function RegisterPage() {
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
              Build trustworthy Bangla NLP research
              evidence.
            </h1>

            <p className="mt-5 max-w-lg text-lg leading-8 text-muted-foreground">
              Create an account to analyse Bangla text,
              compare models, inspect explanations, and
              contribute human feedback.
            </p>

            <div className="mt-10 space-y-7">
              {benefits.map((benefit) => {
                const Icon = benefit.icon;

                return (
                  <div
                    key={benefit.title}
                    className="flex gap-4"
                  >
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-background">
                      <Icon className="size-5 text-emerald-600 dark:text-emerald-400" />
                    </div>

                    <div>
                      <h2 className="font-semibold">
                        {benefit.title}
                      </h2>

                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {benefit.description}
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
            বাংলা প্রাকৃতিক ভাষা প্রক্রিয়াকরণ গবেষণা,
            ব্যাখ্যাযোগ্য কৃত্রিম বুদ্ধিমত্তা এবং মানব
            প্রতিক্রিয়ার জন্য একটি সমন্বিত প্ল্যাটফর্ম।
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
                Research account
              </p>

              <h2 className="mt-2 text-3xl font-bold tracking-tight">
                Create your account
              </h2>

              <p className="mt-3 leading-7 text-muted-foreground">
                Join BanglaGuard to begin your Bangla NLP
                research workflow.
              </p>
            </div>

            <RegisterForm />

            <p className="mt-8 text-center text-xs leading-5 text-muted-foreground">
              By creating an account, you agree to use the
              platform responsibly and ethically for
              research and educational purposes.
            </p>

            <div className="mt-6 text-center">
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

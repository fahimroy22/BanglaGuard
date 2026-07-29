import {
  ArrowRight,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CtaSection() {
  return (
    <section className="py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="relative overflow-hidden rounded-[2.5rem] border bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700 px-7 py-16 text-white shadow-2xl sm:px-12 lg:px-16">
          <div className="absolute -right-24 -top-24 size-72 rounded-full border border-white/20" />
          <div className="absolute -bottom-32 -left-20 size-80 rounded-full bg-white/10 blur-2xl" />

          <div className="relative max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm">
              <Sparkles className="size-4" />
              Start exploring Bangla NLP
            </div>

            <h2 className="mt-7 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
              Turn Bangla text into measurable, explainable research evidence.
            </h2>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/80">
              Create an account, run predictions, compare models, inspect
              explanations, and contribute human feedback.
            </p>

            <div className="mt-9 flex flex-wrap gap-4">
              <Link
                href="/auth/register"
                className={cn(
                  buttonVariants({
                    size: "lg",
                    variant: "secondary",
                  }),
                  "h-12 rounded-xl px-6 text-zinc-950",
                )}
              >
                Create account
                <ArrowRight className="ml-2 size-4" />
              </Link>

              <Link
                href="/auth/login"
                className={cn(
                  buttonVariants({
                    size: "lg",
                    variant: "outline",
                  }),
                  "h-12 rounded-xl border-white/30 bg-transparent px-6 text-white hover:bg-white/10 hover:text-white",
                )}
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

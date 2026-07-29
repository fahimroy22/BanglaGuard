import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Languages,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const highlights = [
  "Bangla hate-speech detection",
  "Sentiment classification",
  "Explainable model outputs",
];

export function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden border-b">
      <div className="absolute inset-0 -z-20 bg-grid-pattern opacity-35" />

      <div className="absolute left-1/2 top-[-18rem] -z-10 size-[42rem] -translate-x-1/2 rounded-full bg-emerald-500/15 blur-3xl" />

      <div className="absolute -bottom-72 -right-60 -z-10 size-[38rem] rounded-full bg-teal-500/10 blur-3xl" />

      <div className="
          mx-auto grid min-h-[calc(100svh-4.5rem)]
          max-w-7xl items-center gap-12
          px-5 py-16 sm:px-8 sm:py-20
          lg:grid-cols-[1.05fr_0.95fr]
          lg:gap-14 lg:py-20
        ">
        <div>
          <Badge
            variant="outline"
            className="mb-7 rounded-full border-emerald-500/30 bg-emerald-500/5 px-4 py-2 text-emerald-700 dark:text-emerald-300"
          >
            <Sparkles className="mr-2 size-4" />
            Explainable Bangla NLP Research Platform
          </Badge>

          <h1 className="
            max-w-4xl text-balance
            text-4xl font-bold tracking-[-0.04em]
            sm:text-5xl
            lg:text-6xl
            xl:text-7xl
          ">
            Research, evaluate, and explain{" "}
            <span className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 bg-clip-text text-transparent">
              Bangla language models.
            </span>
          </h1>

          <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
            BanglaGuard combines hate-speech detection, sentiment analysis,
            model comparison, explainability, analytics, and human feedback
            inside one research-oriented platform.
          </p>

          <p
            lang="bn"
            className="mt-5 max-w-2xl text-xl leading-9 text-foreground/90"
          >
            বাংলা ভাষার টেক্সট বিশ্লেষণ, ঘৃণাত্মক বক্তব্য শনাক্তকরণ এবং
            গবেষণাভিত্তিক মডেল মূল্যায়নের জন্য একটি সমন্বিত প্ল্যাটফর্ম।
          </p>

          <div className="mt-9 flex flex-wrap gap-4">
            <Link
              href="/auth/register"
              className={cn(
                buttonVariants({
                  size: "lg",
                }),
                "h-12 rounded-xl px-6",
              )}
            >
              Start researching
              <ArrowRight className="ml-2 size-4" />
            </Link>

            <Link
              href="/prediction"
              className={cn(
                buttonVariants({
                  size: "lg",
                  variant: "outline",
                }),
                "h-12 rounded-xl px-6",
              )}
            >
              Try live prediction
            </Link>
          </div>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-x-6">
            {highlights.map((highlight) => (
              <div
                key={highlight}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <CheckCircle2 className="size-4 text-emerald-500" />
                {highlight}
              </div>
            ))}
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-xl">
          <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-gradient-to-br from-emerald-500/20 via-transparent to-cyan-500/20 blur-2xl" />

          <div className="overflow-hidden rounded-[2rem] border bg-card/90 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <p className="text-sm font-semibold">
                  Live research workspace
                </p>
                <p className="text-xs text-muted-foreground">
                  Explainable Bangla text analysis
                </p>
              </div>

              <div className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-emerald-500" />
                <span className="size-2.5 rounded-full bg-amber-400" />
                <span className="size-2.5 rounded-full bg-rose-400" />
              </div>
            </div>

            <div className="space-y-5 p-6">
              <div className="rounded-2xl border bg-muted/50 p-5">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Languages className="size-4" />
                  Bangla input
                </div>

                <p lang="bn" className="text-lg leading-8">
                  এই মানুষগুলোকে সমাজ থেকে বের করে দেওয়া উচিত।
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border bg-card p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ShieldCheck className="size-4 text-rose-500" />
                    Hate speech
                  </div>
                  <p className="mt-3 text-3xl font-bold">92.8%</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Model confidence
                  </p>
                </div>

                <div className="rounded-2xl border bg-card p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <MessageSquareText className="size-4 text-amber-500" />
                    Sentiment
                  </div>
                  <p className="mt-3 text-3xl font-bold">Negative</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Classified polarity
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border bg-emerald-500/5 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <BrainCircuit className="size-4 text-emerald-500" />
                  Explanation
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    "সমাজ থেকে",
                    "বের করে",
                    "দেওয়া উচিত",
                  ].map((token, index) => (
                    <span
                      key={token}
                      lang="bn"
                      className={cn(
                        "rounded-lg px-3 py-2 text-sm",
                        index === 0 &&
                          "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                        index === 1 &&
                          "bg-rose-500/20 text-rose-700 dark:text-rose-300",
                        index === 2 &&
                          "bg-rose-500/30 text-rose-700 dark:text-rose-300",
                      )}
                    >
                      {token}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl border px-5 py-4">
                <div className="flex items-center gap-3">
                  <BarChart3 className="size-5 text-cyan-500" />
                  <div>
                    <p className="text-sm font-medium">
                      Model comparison ready
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Baseline and transformer models
                    </p>
                  </div>
                </div>

                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  Active
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

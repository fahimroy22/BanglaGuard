import {
  BarChart3,
  BrainCircuit,
  Database,
  GitCompareArrows,
  MessageSquareWarning,
  MessagesSquare,
} from "lucide-react";

import { SectionHeading } from "@/components/marketing/section-heading";

const features = [
  {
    icon: MessageSquareWarning,
    title: "Hate-speech detection",
    description:
      "Classify potentially abusive or hateful Bangla content using baseline and transformer models.",
  },
  {
    icon: MessagesSquare,
    title: "Sentiment analysis",
    description:
      "Identify positive, neutral, and negative sentiment across Bangla text inputs.",
  },
  {
    icon: BrainCircuit,
    title: "Explainable predictions",
    description:
      "Present confidence scores, class probabilities, and token-level explanation data.",
  },
  {
    icon: GitCompareArrows,
    title: "Model comparison",
    description:
      "Compare architectures, latency, confidence, feedback performance, and registered metrics.",
  },
  {
    icon: BarChart3,
    title: "Research analytics",
    description:
      "Explore prediction trends, label distributions, usage patterns, and model-level performance.",
  },
  {
    icon: Database,
    title: "Human feedback",
    description:
      "Collect corrections and reviewer decisions for evaluation and future model improvement.",
  },
];

export function PlatformSection() {
  return (
    <section
      id="platform"
      className="scroll-mt-24 py-20 sm:py-24 lg:py-28"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHeading
          eyebrow="Platform"
          title="One workspace for the complete Bangla NLP research lifecycle."
          description="BanglaGuard connects data, models, predictions, explanations, analytics, and reviewer feedback through a unified research platform."
        />

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;

            return (
              <article
                key={feature.title}
                className="
                  group relative overflow-hidden rounded-3xl
                  border bg-card p-6 sm:p-7
                  transition-[border-color,box-shadow,transform]
                  duration-300
                  motion-safe:hover:-translate-y-1
                  hover:border-emerald-500/40
                  hover:shadow-xl
                "
              >
                <div className="absolute right-0 top-0 size-28 rounded-full bg-emerald-500/5 blur-2xl transition-colors group-hover:bg-emerald-500/15" />

                <div className="relative flex size-12 items-center justify-center rounded-2xl border bg-muted text-emerald-600 transition-colors group-hover:border-emerald-500/30 group-hover:bg-emerald-500/10 dark:text-emerald-400">
                  <Icon className="size-5" />
                </div>

                <h3 className="relative mt-6 text-xl font-semibold">
                  {feature.title}
                </h3>

                <p className="relative mt-3 leading-7 text-muted-foreground">
                  {feature.description}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

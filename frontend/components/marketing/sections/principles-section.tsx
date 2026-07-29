import {
  Eye,
  FlaskConical,
  LockKeyhole,
  Repeat2,
} from "lucide-react";

import { SectionHeading } from "@/components/marketing/section-heading";

const principles = [
  {
    icon: FlaskConical,
    title: "Research first",
    description:
      "Model experiments, dataset versions, configuration, results, and metrics remain traceable.",
  },
  {
    icon: Eye,
    title: "Explainable by design",
    description:
      "Confidence, probabilities, explanations, and reviewer feedback accompany predictions.",
  },
  {
    icon: Repeat2,
    title: "Reproducible workflows",
    description:
      "Versioned datasets and models make comparisons and future experiments easier to reproduce.",
  },
  {
    icon: LockKeyhole,
    title: "Secure architecture",
    description:
      "Authentication, role restrictions, rate limiting, audit logs, and production isolation support responsible use.",
  },
];

export function PrinciplesSection() {
  return (
    <section className="border-y bg-zinc-950 py-24 text-white sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHeading
          eyebrow="Research principles"
          title="Built for trustworthy experimentation, not only impressive predictions."
          description="BanglaGuard treats security, transparency, reproducibility, and human oversight as core platform requirements."
          className="[&>p:last-child]:text-zinc-400"
        />

        <div className="mt-14 grid gap-5 md:grid-cols-2">
          {principles.map((principle) => {
            const Icon = principle.icon;

            return (
              <article
                key={principle.title}
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-7 backdrop-blur"
              >
                <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
                  <Icon className="size-5" />
                </div>

                <h3 className="mt-6 text-xl font-semibold">
                  {principle.title}
                </h3>

                <p className="mt-3 leading-7 text-zinc-400">
                  {principle.description}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

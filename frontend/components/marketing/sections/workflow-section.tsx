import {
  ArrowDown,
  BrainCircuit,
  Database,
  FileCheck2,
  MessageSquareText,
  ScanSearch,
  UserCheck,
} from "lucide-react";

import { SectionHeading } from "@/components/marketing/section-heading";

const workflow = [
  {
    number: "01",
    icon: Database,
    title: "Collect and version",
    description:
      "Register datasets, sources, licences, task definitions, and label schemas.",
  },
  {
    number: "02",
    icon: FileCheck2,
    title: "Clean and preprocess",
    description:
      "Normalize Bangla Unicode, remove noise, preserve meaningful linguistic information, and create reproducible splits.",
  },
  {
    number: "03",
    icon: BrainCircuit,
    title: "Train and register",
    description:
      "Develop classical baselines and transformer models with versioned configuration and metrics.",
  },
  {
    number: "04",
    icon: ScanSearch,
    title: "Run explainable inference",
    description:
      "Generate labels, confidence scores, class probabilities, latency, and explanations.",
  },
  {
    number: "05",
    icon: MessageSquareText,
    title: "Analyse results",
    description:
      "Inspect distributions, compare model versions, and export research-ready reports.",
  },
  {
    number: "06",
    icon: UserCheck,
    title: "Review and improve",
    description:
      "Use human feedback and corrected labels to guide evaluation and future model development.",
  },
];

export function WorkflowSection() {
  return (
    <section
      id="workflow"
      className="scroll-mt-24 border-y bg-muted/30 py-20 sm:py-24 lg:py-28"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHeading
          eyebrow="Research workflow"
          title="From raw Bangla text to evidence-based model improvement."
          description="Every stage is designed for reproducibility, evaluation, transparency, and future expansion."
        />

        <div className="mx-auto mt-16 max-w-4xl">
          {workflow.map((step, index) => {
            const Icon = step.icon;
            const isLast = index === workflow.length - 1;

            return (
              <div key={step.number}>
                <div className="
                    grid gap-5 rounded-3xl border bg-card
                    p-5 shadow-sm
                    sm:grid-cols-[auto_1fr]
                    sm:items-start sm:p-6
                    lg:grid-cols-[auto_1fr_auto]
                    lg:items-center lg:p-7
                  ">
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Icon className="size-6" />
                  </div>

                  <div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
                        {step.number}
                      </span>
                      <h3 className="text-xl font-semibold">
                        {step.title}
                      </h3>
                    </div>

                    <p className="mt-2 leading-7 text-muted-foreground">
                      {step.description}
                    </p>
                  </div>

                  <span className="
                    w-fit rounded-full border px-3 py-1
                    text-xs font-medium text-muted-foreground
                    sm:col-start-2
                    lg:col-start-auto
                  ">
                    Research stage
                  </span>
                </div>

                {!isLast && (
                  <div className="flex h-12 items-center justify-center">
                    <ArrowDown className="size-5 text-muted-foreground" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

import {
  Activity,
  Boxes,
  Gauge,
  GitCompareArrows,
} from "lucide-react";

import { SectionHeading } from "@/components/marketing/section-heading";
import { Badge } from "@/components/ui/badge";

const models = [
  {
    name: "TF-IDF Logistic Regression",
    type: "Classical baseline",
    status: "Registered",
    description:
      "A transparent and efficient baseline for evaluating transformer improvements.",
    metrics: [
      "Fast inference",
      "Interpretable features",
      "Baseline comparison",
    ],
  },
  {
    name: "BanglaBERT Classifier",
    type: "Transformer",
    status: "Active",
    description:
      "Contextual Bangla sequence classification for hate-speech and sentiment research.",
    metrics: [
      "Context-aware",
      "Probability output",
      "Explainability ready",
    ],
  },
  {
    name: "Future Research Models",
    type: "Extensible registry",
    status: "Planned",
    description:
      "The versioned model registry supports additional transformer, multilingual, and ensemble models.",
    metrics: [
      "Version controlled",
      "Metrics registry",
      "Safe activation",
    ],
  },
];

export function ModelsSection() {
  return (
    <section
      id="models"
      className="scroll-mt-24 py-20 sm:py-24 lg:py-28"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHeading
          eyebrow="Model registry"
          title="Compare simple baselines with contextual Bangla transformers."
          description="High accuracy is only meaningful when evaluated against transparent baselines, latency, confidence, feedback, and reproducible metrics."
        />

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {models.map((model, index) => (
            <article
              key={model.name}
              className="
                flex flex-col rounded-3xl border
                bg-card p-6 shadow-sm
                transition-[border-color,box-shadow,transform]
                duration-300
                motion-safe:hover:-translate-y-1
                hover:border-emerald-500/30
                hover:shadow-lg
                sm:p-7
              "
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
                  {index === 0 && (
                    <Gauge className="size-5 text-cyan-500" />
                  )}

                  {index === 1 && (
                    <Activity className="size-5 text-emerald-500" />
                  )}

                  {index === 2 && (
                    <Boxes className="size-5 text-violet-500" />
                  )}
                </div>

                <Badge
                  variant={
                    model.status === "Active"
                      ? "default"
                      : "secondary"
                  }
                >
                  {model.status}
                </Badge>
              </div>

              <p className="mt-6 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                {model.type}
              </p>

              <h3 className="mt-2 text-2xl font-semibold">
                {model.name}
              </h3>

              <p className="mt-4 flex-1 leading-7 text-muted-foreground">
                {model.description}
              </p>

              <div className="mt-7 space-y-3 border-t pt-6">
                {model.metrics.map((metric) => (
                  <div
                    key={metric}
                    className="flex items-center gap-3 text-sm"
                  >
                    <GitCompareArrows className="size-4 text-emerald-500" />
                    {metric}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

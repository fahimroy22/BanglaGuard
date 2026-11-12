import type { Metadata } from "next";

import { ExperimentWorkspace } from "@/components/experiments/experiment-workspace";

export const metadata: Metadata = {
  title: "Experiment Manager | BanglaGuard",
  description:
    "Manage BanglaGuard model-training experiments.",
};

export default function ExperimentsPage() {
  return <ExperimentWorkspace />;
}

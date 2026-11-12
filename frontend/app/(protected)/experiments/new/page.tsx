import type { Metadata } from "next";

import { NewExperimentWorkspace } from "@/components/experiments/new-experiment-workspace";

export const metadata: Metadata = {
  title: "New Experiment | BanglaGuard",
  description:
    "Configure and prepare a BanglaGuard training experiment.",
};

export default function NewExperimentPage() {
  return <NewExperimentWorkspace />;
}

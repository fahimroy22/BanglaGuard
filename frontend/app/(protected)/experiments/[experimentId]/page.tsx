import type { Metadata } from "next";

import { ExperimentDetailsWorkspace } from "@/components/experiments/experiment-details-workspace";

type ExperimentDetailsPageProps = {
  params: Promise<{
    experimentId: string;
  }>;
};

export const metadata: Metadata = {
  title: "Experiment Details | BanglaGuard",
  description:
    "Review experiment configuration, execution status, results and registered model information.",
};

export default async function ExperimentDetailsPage({
  params,
}: ExperimentDetailsPageProps) {
  const { experimentId } = await params;

  return (
    <ExperimentDetailsWorkspace
      experimentId={experimentId}
    />
  );
}

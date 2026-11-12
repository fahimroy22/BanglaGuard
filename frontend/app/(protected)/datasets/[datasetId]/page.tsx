import type { Metadata } from "next";

import { DatasetDetailsWorkspace } from "@/components/datasets/dataset-details-workspace";

type DatasetDetailsPageProps = {
  params: Promise<{
    datasetId: string;
  }>;
};

export const metadata: Metadata = {
  title: "Dataset Details | BanglaGuard",
  description:
    "Inspect dataset metadata, files, statistics, previews and quality evidence.",
};

export default async function DatasetDetailsPage({
  params,
}: DatasetDetailsPageProps) {
  const { datasetId } = await params;

  return (
    <DatasetDetailsWorkspace
      datasetId={datasetId}
    />
  );
}
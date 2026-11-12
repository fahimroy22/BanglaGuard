import type { Metadata } from "next";

import { DatasetWorkspace } from "@/components/datasets/dataset-workspace";

export const metadata: Metadata = {
  title: "Dataset Registry | BanglaGuard",
  description:
    "Manage versioned BanglaGuard research datasets.",
};

export default function DatasetsPage() {
  return <DatasetWorkspace />;
}
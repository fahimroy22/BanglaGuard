import type { Metadata } from "next";

import { DatasetGuidedUpload } from "@/components/datasets/dataset-guided-upload";

export const metadata: Metadata = {
  title: "Upload Dataset | BanglaGuard",
  description:
    "Inspect, validate and register a BanglaGuard research dataset.",
};

export default function DatasetUploadPage() {
  return <DatasetGuidedUpload />;
}

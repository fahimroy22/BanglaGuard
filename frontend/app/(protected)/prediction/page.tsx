import type { Metadata } from "next";

import { PredictionWorkspace } from "@/components/prediction/prediction-workspace";

export const metadata: Metadata = {
  title: "Prediction Workspace | BanglaGuard",
  description:
    "Analyse Bangla text for hate speech and sentiment with explainable model outputs.",
};

export default function PredictionPage() {
  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <PredictionWorkspace />
      </div>
    </div>
  );
}

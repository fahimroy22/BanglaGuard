"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { AnalysisTask } from "@/types/prediction";

type SettingsState = {
  defaultPredictionTask: AnalysisTask;
  includeExplanationByDefault: boolean;

  setDefaultPredictionTask: (task: AnalysisTask) => void;

  setIncludeExplanationByDefault: (enabled: boolean) => void;

  resetPreferences: () => void;
};

const DEFAULT_SETTINGS = {
  defaultPredictionTask: "hate_speech" as AnalysisTask,
  includeExplanationByDefault: true,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      setDefaultPredictionTask: (defaultPredictionTask) => {
        set({
          defaultPredictionTask,
        });
      },

      setIncludeExplanationByDefault: (includeExplanationByDefault) => {
        set({
          includeExplanationByDefault,
        });
      },

      resetPreferences: () => {
        set(DEFAULT_SETTINGS);
      },
    }),
    {
      name: "banglaguard_settings",
    },
  ),
);

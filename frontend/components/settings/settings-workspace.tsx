"use client";

import {
  BrainCircuit,
  ExternalLink,
  Laptop,
  MonitorCog,
  Moon,
  RotateCcw,
  Sun,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/store/settings-store";

import type { AnalysisTask } from "@/types/prediction";

type ThemePreference = "light" | "dark" | "system";

const themeOptions: Array<{
  value: ThemePreference;
  label: string;
  description: string;
  icon: typeof Sun;
}> = [
  {
    value: "light",
    label: "Light",
    description: "Always use the light interface.",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Always use the dark interface.",
    icon: Moon,
  },
  {
    value: "system",
    label: "System",
    description: "Follow your operating system appearance.",
    icon: Laptop,
  },
];

export function SettingsWorkspace() {
  const { theme, setTheme } = useTheme();

  const {
    defaultPredictionTask,
    includeExplanationByDefault,
    setDefaultPredictionTask,
    setIncludeExplanationByDefault,
    resetPreferences,
  } = useSettingsStore();

  const currentTheme =
    theme === "light" || theme === "dark" || theme === "system"
      ? theme
      : "system";

  function handleReset() {
    resetPreferences();
    setTheme("system");

    toast.success("Workspace preferences reset.");
  }

  return (
    <main className="workspace-container">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

            <Badge variant="outline">Local workspace</Badge>
          </div>

          <p className="text-sm text-muted-foreground">
            Configure how BanglaGuard behaves in this browser.
          </p>
        </header>

        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="border-b px-5 py-4">
            <div className="flex items-start gap-3">
              <MonitorCog className="mt-0.5 size-5 text-muted-foreground" />

              <div>
                <h2 className="font-semibold">Appearance</h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Choose how the BanglaGuard interface is displayed.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 p-5 md:grid-cols-3">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              const selected = currentTheme === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTheme(option.value)}
                  className={[
                    "rounded-lg border p-4 text-left transition",
                    "hover:bg-muted/50",
                    selected
                      ? "border-[var(--gh-accent-fg)] bg-[var(--gh-accent-fg)]/5"
                      : "",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <Icon className="size-4" />

                    {selected ? (
                      <Badge variant="secondary">Selected</Badge>
                    ) : null}
                  </div>

                  <div className="mt-4 text-sm font-medium">{option.label}</div>

                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {option.description}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="border-b px-5 py-4">
            <div className="flex items-start gap-3">
              <BrainCircuit className="mt-0.5 size-5 text-muted-foreground" />

              <div>
                <h2 className="font-semibold">Prediction defaults</h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Set the initial options used when opening the Prediction
                  workspace.
                </p>
              </div>
            </div>
          </div>

          <div className="divide-y">
            <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-xl">
                <div className="text-sm font-medium">Default analysis task</div>

                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  This task will be selected when a new Prediction workspace is
                  opened.
                </p>
              </div>

              <select
                value={defaultPredictionTask}
                onChange={(event) =>
                  setDefaultPredictionTask(event.target.value as AnalysisTask)
                }
                className="gh-input h-9 min-w-44 rounded-md px-3 text-sm"
                aria-label="Default prediction task"
              >
                <option value="hate_speech">Hate speech</option>

                <option value="sentiment">Sentiment</option>
              </select>
            </div>

            <div className="flex items-center justify-between gap-6 px-5 py-4">
              <div className="max-w-xl">
                <div className="text-sm font-medium">
                  Explanations by default
                </div>

                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Request model explanations automatically when the selected
                  model supports explainability.
                </p>
              </div>

              <Switch
                checked={includeExplanationByDefault}
                onCheckedChange={setIncludeExplanationByDefault}
                aria-label="Enable explanations by default"
              />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="border-b px-5 py-4">
            <div className="flex items-start gap-3">
              <UserRound className="mt-0.5 size-5 text-muted-foreground" />

              <div>
                <h2 className="font-semibold">Account</h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Personal information and security settings are managed from
                  your profile.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium">Profile & security</div>

              <p className="mt-1 text-xs text-muted-foreground">
                Update your name, email, avatar, and password.
              </p>
            </div>

            <Link
              href="/profile"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition hover:bg-muted"
            >
              Open profile
              <ExternalLink className="size-3.5" />
            </Link>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium">Local preferences</div>

              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Theme and prediction defaults are stored locally in this
                browser.
              </p>
            </div>

            <Button type="button" variant="outline" onClick={handleReset}>
              <RotateCcw className="size-4" />
              Reset preferences
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}

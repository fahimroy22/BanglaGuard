"use client";

import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  CircleX,
  FileCheck2,
  Info,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { getDatasetQualityReport } from "@/lib/dataset-management";
import type {
  DatasetQualityCheckRead,
  DatasetQualitySplitRead,
} from "@/types/dataset-management";

type DatasetQualityReportProps = {
  datasetId: string;
};

export function DatasetQualityReport({
  datasetId,
}: DatasetQualityReportProps) {
  const qualityQuery = useQuery({
    queryKey: [
      "datasets",
      "quality-report",
      datasetId,
    ],
    queryFn: () =>
      getDatasetQualityReport(datasetId),
  });

  if (qualityQuery.isLoading) {
    return <QualityLoading />;
  }

  if (qualityQuery.isError) {
    return (
      <QualityError
        onRetry={() => {
          void qualityQuery.refetch();
        }}
      />
    );
  }

  const report = qualityQuery.data;

  if (!report) {
    return <QualityUnavailable />;
  }

  const passedChecks = report.checks.filter(
    (check) => check.passed,
  ).length;

  const failedChecks =
    report.checks.length - passedChecks;

  const score = normalizeScore(
    report.quality_score,
  );

  return (
    <div className="space-y-5 bg-background p-4 sm:p-5">
      <section className="overflow-hidden rounded-xl border border-[var(--gh-border-default)] bg-[var(--gh-canvas)]">
        <header className="flex flex-col gap-3 border-b border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--gh-fg-default)]">
              Dataset quality
            </h2>

            <p className="mt-0.5 text-xs text-[var(--gh-fg-muted)]">
              Integrity and training-readiness
              checks.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              void qualityQuery.refetch();
            }}
            disabled={qualityQuery.isFetching}
            className="gh-button"
          >
            <RefreshCw
              className={[
                "size-4",
                qualityQuery.isFetching
                  ? "animate-spin"
                  : "",
              ].join(" ")}
            />

            Refresh
          </button>
        </header>

        <div className="grid gap-3 bg-background p-3 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryItem
            label="Quality score"
            value={`${score}%`}
          />

          <SummaryItem
            label="Training ready"
            value={
              report.training_ready
                ? "Yes"
                : "No"
            }
            positive={report.training_ready}
            negative={!report.training_ready}
          />

          <SummaryItem
            label="Passed checks"
            value={String(passedChecks)}
            positive
          />

          <SummaryItem
            label="Failed checks"
            value={String(failedChecks)}
            negative={failedChecks > 0}
          />

          <SummaryItem
            label="Status"
            value={formatStatus(report.status)}
            positive={report.training_ready}
            negative={!report.training_ready}
          />
        </div>
      </section>

      <QualityCharts key={datasetId} report={report} />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <QualityChecks
            checks={report.checks}
          />

          <DatasetSplits
            splits={report.splits}
          />
        </div>

        <aside className="space-y-4">
          <HealthPanel
            score={score}
            trainingReady={
              report.training_ready
            }
            status={report.status}
          />

          <RegisteredCounts
            registered={report.registered_counts}
            manifest={report.manifest_counts}
            actual={report.actual_counts}
          />

          <MessagePanel
            title="Errors"
            messages={report.errors}
            tone="danger"
          />

          <MessagePanel
            title="Warnings"
            messages={report.warnings}
            tone="attention"
          />

          <MessagePanel
            title="Recommendations"
            messages={report.recommendations}
            tone="neutral"
          />
        </aside>
      </div>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  positive = false,
  negative = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="min-h-24 rounded-xl border border-border bg-card px-4 py-4">
      <p className="text-xs text-[var(--gh-fg-muted)]">
        {label}
      </p>

      <p
        className={[
          "mt-1 text-lg font-semibold",
          positive
            ? "text-[var(--gh-success-fg)]"
            : negative
              ? "text-[var(--gh-danger-fg)]"
              : "text-[var(--gh-fg-default)]",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

function QualityChecks({
  checks,
}: {
  checks: DatasetQualityCheckRead[];
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--gh-border-default)] bg-[var(--gh-canvas)]">
      <header className="border-b border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--gh-fg-default)]">
          Validation checks
        </h2>

        <p className="mt-0.5 text-xs text-[var(--gh-fg-muted)]">
          {checks.length} checks evaluated.
        </p>
      </header>

      {checks.length === 0 ? (
        <div className="p-4 text-sm text-[var(--gh-fg-muted)]">
          No validation checks were returned.
        </div>
      ) : (
        <div className="divide-y divide-[var(--gh-border-muted)]">
          {checks.map((check) => (
            <QualityCheckRow
              key={check.key}
              check={check}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function QualityCheckRow({
  check,
}: {
  check: DatasetQualityCheckRead;
}) {
  const severity =
    check.severity.toLowerCase();

  const warning =
    !check.passed &&
    severity.includes("warn");

  const Icon = check.passed
    ? CheckCircle2
    : warning
      ? AlertTriangle
      : CircleX;

  return (
    <article className="flex items-start gap-3 px-4 py-3">
      <Icon
        className={[
          "mt-0.5 size-4 shrink-0",
          check.passed
            ? "text-[var(--gh-success-fg)]"
            : warning
              ? "text-[var(--gh-attention-fg)]"
              : "text-[var(--gh-danger-fg)]",
        ].join(" ")}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-[var(--gh-fg-default)]">
            {formatKey(check.key)}
          </p>

          <span className="gh-badge">
            {check.passed
              ? "Passed"
              : formatStatus(check.severity)}
          </span>
        </div>

        <p className="mt-1 text-xs leading-5 text-[var(--gh-fg-muted)]">
          {check.message}
        </p>

        {check.expected !== null ||
        check.actual !== null ? (
          <div className="mt-2 flex flex-wrap break-all gap-x-5 gap-y-1 text-xs text-[var(--gh-fg-subtle)]">
            {check.expected !== null ? (
              <span>
                Expected:{" "}
                {formatValue(check.expected)}
              </span>
            ) : null}

            {check.actual !== null ? (
              <span>
                Actual:{" "}
                {formatValue(check.actual)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function DatasetSplits({
  splits,
}: {
  splits: Record<
    string,
    DatasetQualitySplitRead
  >;
}) {
  const entries = Object.entries(splits);

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--gh-border-default)] bg-[var(--gh-canvas)]">
      <header className="border-b border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--gh-fg-default)]">
          Dataset splits
        </h2>

        <p className="mt-0.5 text-xs text-[var(--gh-fg-muted)]">
          Row integrity and label balance.
        </p>
      </header>

      {entries.length === 0 ? (
        <div className="p-4 text-sm text-[var(--gh-fg-muted)]">
          No split statistics were returned.
        </div>
      ) : (
        <div className="divide-y divide-[var(--gh-border-muted)]">
          {entries.map(([key, split]) => (
            <SplitReport
              key={key}
              split={split}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SplitReport({
  split,
}: {
  split: DatasetQualitySplitRead;
}) {
  const labels = Object.entries(
    split.label_distribution,
  ).sort((a, b) => b[1] - a[1]);

  return (
    <article className="p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileCheck2 className="size-4 text-[var(--gh-fg-muted)]" />

            <h3 className="text-sm font-semibold text-[var(--gh-fg-default)]">
              {split.filename}
            </h3>

            <span
              className={[
                "gh-badge",
                split.counts_match
                  ? "text-[var(--gh-success-fg)]"
                  : "text-[var(--gh-danger-fg)]",
              ].join(" ")}
            >
              {split.counts_match
                ? "Counts match"
                : "Count mismatch"}
            </span>
          </div>

          <p className="mt-1 text-xs text-[var(--gh-fg-muted)]">
            {split.columns.length} columns
          </p>
        </div>

        <p className="text-sm text-[var(--gh-fg-muted)]">
          {split.actual_rows.toLocaleString()}{" "}
          rows
        </p>
      </div>

      <div className="mt-4 grid overflow-hidden rounded-xl border border-[var(--gh-border-default)] sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Missing text"
          value={split.missing_text_rows}
        />

        <Metric
          label="Missing labels"
          value={split.missing_label_rows}
        />

        <Metric
          label="Duplicates"
          value={split.duplicate_text_rows}
        />

        <Metric
          label="Replacement chars"
          value={
            split.replacement_character_rows
          }
        />
      </div>

      {labels.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium text-[var(--gh-fg-default)]">
            Label distribution
          </p>

          <div className="mt-3 space-y-3">
            {labels.map(([label, count]) => {
              const percentage =
                split.label_percentages[
                  label
                ] ?? 0;

              return (
                <div key={label}>
                  <div className="flex items-center justify-between gap-4 text-xs">
                    <span className="truncate text-[var(--gh-fg-default)]">
                      {label}
                    </span>

                    <span className="shrink-0 text-[var(--gh-fg-muted)]">
                      {count.toLocaleString()} ·{" "}
                      {formatPercentage(
                        percentage,
                      )}
                    </span>
                  </div>

                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--gh-neutral-muted)]">
                    <div
                      className="h-full rounded-full bg-[var(--gh-accent-emphasis)]"
                      style={{
                        width: `${clampPercentage(
                          percentage,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-4">
        <CompactValue
          label="Minimum length"
          value={formatNullableNumber(
            split.text_length.minimum,
          )}
        />

        <CompactValue
          label="Average length"
          value={formatNullableNumber(
            split.text_length.average,
          )}
        />

        <CompactValue
          label="Maximum length"
          value={formatNullableNumber(
            split.text_length.maximum,
          )}
        />

        <CompactValue
          label="Measured rows"
          value={split.text_length.count.toLocaleString()}
        />
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="border-b border-[var(--gh-border-default)] px-3 py-2.5 sm:border-r lg:border-b-0">
      <p className="text-xs text-[var(--gh-fg-muted)]">
        {label}
      </p>

      <p
        className={[
          "mt-1 text-sm font-semibold",
          value === 0
            ? "text-[var(--gh-success-fg)]"
            : "text-[var(--gh-attention-fg)]",
        ].join(" ")}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function CompactValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[var(--gh-fg-muted)]">
        {label}
      </p>

      <p className="mt-1 font-medium text-[var(--gh-fg-default)]">
        {value}
      </p>
    </div>
  );
}

function HealthPanel({
  score,
  trainingReady,
  status,
}: {
  score: number;
  trainingReady: boolean;
  status: string;
}) {
  const health =
    trainingReady && score >= 90
      ? "Excellent"
      : trainingReady
        ? "Ready"
        : score >= 60
          ? "Needs review"
          : "Failed";

  const positive = trainingReady;
  const danger =
    !trainingReady && score < 60;

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--gh-border-default)] bg-[var(--gh-canvas)]">
      <header className="border-b border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--gh-fg-default)]">
          Dataset health
        </h2>
      </header>

      <div className="p-4">
        <div className="flex items-center gap-3">
          <div
            className={[
              "flex size-10 items-center justify-center rounded-full border",
              positive
                ? "border-[var(--gh-success-muted)] bg-[var(--gh-success-subtle)]"
                : danger
                  ? "border-[var(--gh-danger-muted)] bg-[var(--gh-danger-subtle)]"
                  : "border-[var(--gh-attention-muted)] bg-[var(--gh-attention-subtle)]",
            ].join(" ")}
          >
            <ShieldCheck
              className={[
                "size-5",
                positive
                  ? "text-[var(--gh-success-fg)]"
                  : danger
                    ? "text-[var(--gh-danger-fg)]"
                    : "text-[var(--gh-attention-fg)]",
              ].join(" ")}
            />
          </div>

          <div>
            <p className="text-lg font-semibold text-[var(--gh-fg-default)]">
              {health}
            </p>

            <p className="text-xs text-[var(--gh-fg-muted)]">
              {formatStatus(status)}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex justify-between text-xs">
            <span className="text-[var(--gh-fg-muted)]">
              Quality score
            </span>

            <span className="font-medium text-[var(--gh-fg-default)]">
              {score}%
            </span>
          </div>

          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--gh-neutral-muted)]">
            <div
              className="h-full rounded-full bg-[var(--gh-accent-emphasis)]"
              style={{
                width: `${score}%`,
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function RegisteredCounts({
  registered,
  manifest,
  actual,
}: {
  registered: Record<string, number>;
  manifest: Record<string, number>;
  actual: Record<string, number>;
}) {
  const keys = Array.from(
    new Set([
      ...Object.keys(registered),
      ...Object.keys(manifest),
      ...Object.keys(actual),
    ]),
  );

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--gh-border-default)] bg-[var(--gh-canvas)]">
      <header className="border-b border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--gh-fg-default)]">
          Row counts
        </h2>
      </header>

      {keys.length === 0 ? (
        <div className="p-4 text-sm text-[var(--gh-fg-muted)]">
          No row counts available.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-[var(--gh-border-muted)] bg-[var(--gh-canvas-subtle)] text-[var(--gh-fg-muted)]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">
                  Split
                </th>

                <th className="px-3 py-2 text-right font-medium">
                  Registered
                </th>

                <th className="px-3 py-2 text-right font-medium">
                  Manifest
                </th>
                <th className="px-3 py-2 text-right font-medium">Actual</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--gh-border-muted)]">
              {keys.map((key) => (
                <tr key={key}>
                  <td className="px-3 py-2 text-[var(--gh-fg-default)]">
                    {formatKey(key)}
                  </td>

                  <td className="px-3 py-2 text-right text-[var(--gh-fg-muted)]">
                    {formatCount(
                      registered[key],
                    )}
                  </td>

                  <td className="px-3 py-2 text-right text-[var(--gh-fg-default)]">
                    {formatCount(manifest[key])}
                  </td>
                  <td className="px-3 py-2 text-right">{formatCount(actual[key])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MessagePanel({
  title,
  messages,
  tone,
}: {
  title: string;
  messages: string[];
  tone:
    | "danger"
    | "attention"
    | "neutral";
}) {
  if (messages.length === 0) {
    return null;
  }

  const Icon =
    tone === "danger"
      ? CircleX
      : tone === "attention"
        ? AlertTriangle
        : Info;

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--gh-border-default)] bg-[var(--gh-canvas)]">
      <header className="flex items-center gap-2 border-b border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] px-4 py-3">
        <Icon
          className={[
            "size-4",
            tone === "danger"
              ? "text-[var(--gh-danger-fg)]"
              : tone === "attention"
                ? "text-[var(--gh-attention-fg)]"
                : "text-[var(--gh-fg-muted)]",
          ].join(" ")}
        />

        <h2 className="text-sm font-semibold text-[var(--gh-fg-default)]">
          {title}
        </h2>

        <span className="gh-badge">
          {messages.length}
        </span>
      </header>

      <ul className="divide-y divide-[var(--gh-border-muted)]">
        {messages.map((message, index) => (
          <li
            key={`${title}-${index}`}
            className="px-4 py-3 text-xs leading-5 text-[var(--gh-fg-muted)]"
          >
            {message}
          </li>
        ))}
      </ul>
    </section>
  );
}

function QualityLoading() {
  return (
    <div className="flex min-h-72 items-center justify-center rounded-xl border border-[var(--gh-border-default)] text-sm text-[var(--gh-fg-muted)]">
      <RefreshCw className="mr-2 size-4 animate-spin" />
      Loading quality report…
    </div>
  );
}

function QualityError({
  onRetry,
}: {
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-[var(--gh-border-default)] px-5 text-center">
      <CircleX className="size-7 text-[var(--gh-danger-fg)]" />

      <p className="mt-3 text-sm font-medium text-[var(--gh-fg-default)]">
        Quality report could not load
      </p>

      <p className="mt-1 max-w-md text-xs text-[var(--gh-fg-muted)]">
        The dataset may not have the
        required manifest or artifact files.
      </p>

      <button
        type="button"
        onClick={onRetry}
        className="gh-button mt-4"
      >
        <RefreshCw className="size-4" />
        Try again
      </button>
    </div>
  );
}

function QualityUnavailable() {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-[var(--gh-border-default)] px-5 text-center">
      <ShieldCheck className="size-7 text-[var(--gh-fg-subtle)]" />

      <p className="mt-3 text-sm font-medium text-[var(--gh-fg-default)]">
        No quality report available
      </p>
    </div>
  );
}

function normalizeScore(value: number): number {
  const score =
    value <= 1 ? value * 100 : value;

  return Math.round(
    Math.max(0, Math.min(100, score)),
  );
}

function clampPercentage(
  value: number,
): number {
  const percentage =
    value <= 1 ? value * 100 : value;

  return Math.max(
    0,
    Math.min(100, percentage),
  );
}

function formatPercentage(
  value: number,
): string {
  return `${clampPercentage(value).toFixed(
    1,
  )}%`;
}

function formatStatus(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function formatKey(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function formatNullableNumber(
  value: number | null,
): string {
  if (value === null) {
    return "—";
  }

  return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, {
        maximumFractionDigits: 1,
      });
}

function formatCount(
  value: number | undefined,
): string {
  return typeof value === "number"
    ? value.toLocaleString()
    : "—";
}

function formatValue(
  value: unknown,
): string {
  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "Unavailable";
  }
}

function QualityCharts({ report }: { report: Awaited<ReturnType<typeof getDatasetQualityReport>> }) {
  const [filter, setFilter] = useState<"all" | "passed" | "failed">("all");
  const [category, setCategory] = useState("all");
  const [series, setSeries] = useState("all");
  const passed = report.checks.filter((check) => check.passed).length;
  const failed = report.checks.length - passed;
  const outcomes = [
    { label: "Passed", value: passed, color: "var(--gh-success-fg)" },
    { label: "Failed", value: failed, color: "var(--gh-danger-fg)" },
  ];
  const keys = Array.from(new Set([...Object.keys(report.registered_counts), ...Object.keys(report.manifest_counts), ...Object.keys(report.actual_counts)]));
  const categories = category !== "all" && keys.includes(category) ? [category] : keys;
  const allSeries = [
    { label: "Registered", values: report.registered_counts, color: "var(--chart-1)" },
    { label: "Manifest", values: report.manifest_counts, color: "var(--chart-2)" },
    { label: "Actual", values: report.actual_counts, color: "var(--chart-4)" },
  ];
  const shown = series === "all" ? allSeries : allSeries.filter((item) => item.label === series);
  const maximum = Math.max(1, ...categories.flatMap((key) => shown.map((item) => item.values[key]).filter((value) => Number.isFinite(value) && value >= 0)));
  const scale = 10 ** Math.floor(Math.log10(maximum));
  const axisMax = Math.ceil(maximum / scale) * scale;
  const width = Math.max(560, categories.length * 120 + 100);
  const slot = (width - 100) / Math.max(1, categories.length);
  const barWidth = Math.min(26, slot / 5);
  const visibleChecks = report.checks.filter((check) => filter === "all" || (filter === "passed" ? check.passed : !check.passed));
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <figure className="min-w-0 rounded-[14px] border border-border bg-card p-5">
        <figcaption><h3 className="text-base font-semibold">Validation results</h3><p className="mt-1 text-xs text-muted-foreground">Returned check outcomes, separate from the quality score.</p></figcaption>
        {report.checks.length === 0 ? <p className="py-10 text-sm text-muted-foreground">No checks returned.</p> : <>
          <svg viewBox="0 0 320 230" className="mx-auto h-56 w-full max-w-sm" role="img" aria-label={`${passed} passed checks, ${failed} failed checks`}>
            <title>Validation check outcomes</title>
            {outcomes.map((item, index) => <circle key={item.label} cx="160" cy="110" r="76" pathLength="100" fill="none" stroke={item.color} strokeWidth="28" strokeDasharray={`${item.value / report.checks.length * 100} ${100 - item.value / report.checks.length * 100}`} strokeDashoffset={index === 0 ? 0 : -passed / report.checks.length * 100} transform="rotate(-90 160 110)"><title>{item.label}: {item.value} checks</title></circle>)}
            <text x="160" y="107" textAnchor="middle" fill="var(--foreground)" fontSize="30" fontWeight="700">{report.checks.length}</text>
            <text x="160" y="130" textAnchor="middle" fill="var(--muted-foreground)" fontSize="12">checks evaluated</text>
          </svg>
          <div className="flex flex-wrap gap-2">{(["all", "passed", "failed"] as const).map((value) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} className={`gh-button ${filter === value ? "!border-primary !bg-accent" : ""}`}>{formatKey(value)} {value === "all" ? report.checks.length : value === "passed" ? passed : failed}</button>)}</div>
          <div aria-live="polite" className="mt-3 max-h-40 overflow-auto rounded-xl bg-muted/40 p-3 text-xs">
            {visibleChecks.length ? <ul className="space-y-2">{visibleChecks.map((check) => <li key={check.key}>{check.passed ? "Passed" : "Failed"} · {formatKey(check.key)}</li>)}</ul> : "No checks in this category."}
          </div>
        </>}
      </figure>
      <figure className="min-w-0 rounded-[14px] border border-border bg-card p-5">
        <figcaption><h3 className="text-base font-semibold">Row count comparison</h3><p className="mt-1 text-xs text-muted-foreground">Compare each source independently. Processed data and its splits overlap; counts are not added together.</p></figcaption>
        <div className="mt-4 flex flex-wrap gap-2">
          <select aria-label="Row count category" className="gh-input !w-auto max-w-full" value={keys.includes(category) ? category : "all"} onChange={(event) => setCategory(event.target.value)}><option value="all">All files / splits</option>{keys.map((key) => <option key={key} value={key}>{formatKey(key)}</option>)}</select>
          <select aria-label="Row count source" className="gh-input !w-auto" value={series} onChange={(event) => setSeries(event.target.value)}><option value="all">All sources</option>{allSeries.map((item) => <option key={item.label}>{item.label}</option>)}</select>
        </div>
        {keys.length === 0 ? <p className="py-10 text-sm text-muted-foreground">No row counts returned.</p> : <>
          <div className="mt-4 overflow-x-auto"><svg viewBox={`0 0 ${width} 300`} className="block w-full" style={{ minWidth: categories.length > 4 ? width : 360 }} role="img" aria-label="Grouped column chart of registered, manifest, and actual row counts; exact values in table below.">
            <title>Row counts by file and source</title>
            {[0, 1, 2, 3, 4].map((tick) => <g key={tick}><line x1="70" y1={230 - tick * 50} x2={width - 20} y2={230 - tick * 50} stroke="var(--border)" strokeDasharray={tick ? "4 5" : undefined}/><text x="60" y={234 - tick * 50} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">{(axisMax * tick / 4).toLocaleString(undefined, { maximumFractionDigits: 1 })}</text></g>)}
            {categories.map((key, i) => <g key={key}>{shown.map((item, j) => {
              const value = item.values[key];
              if (!Number.isFinite(value) || value < 0) return null;
              const height = value / axisMax * 200;
              const x = 70 + slot * (i + 0.5) + (j - shown.length / 2) * (barWidth + 4);
              return <rect key={item.label} x={x} y={230 - height} width={barWidth} height={height} rx="3" fill={item.color}><title>{formatKey(key)} · {item.label}: {value.toLocaleString()} rows</title></rect>;
            })}<text x={70 + slot * (i + 0.5)} y="251" textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">{formatKey(key).slice(0, 18)}</text></g>)}
            <text x={width / 2} y="284" textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">File / split · row counts</text>
          </svg></div>
          <div className="my-3 flex flex-wrap gap-4 text-xs text-muted-foreground">{shown.map((item) => <span key={item.label} className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>)}</div>
          <div className="overflow-x-auto"><table className="gh-table"><caption className="pb-2 text-left text-xs text-muted-foreground">Exact counts. — means unavailable, not zero.</caption><thead><tr><th scope="col">File / split</th>{shown.map((item) => <th scope="col" key={item.label}>{item.label}</th>)}</tr></thead><tbody>{categories.map((key) => <tr key={key}><td>{formatKey(key)}</td>{shown.map((item) => <td key={item.label}>{formatCount(item.values[key])}</td>)}</tr>)}</tbody></table></div>
        </>}
      </figure>
    </div>
  );
}

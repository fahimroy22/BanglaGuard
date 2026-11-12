"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Database,
  Download,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { DatasetResearchWorkspace } from "@/components/datasets/dataset-research-workspace";
import { DatasetQualityReport } from "@/components/datasets/dataset-quality-report";
import {
  downloadDatasetFile,
  getDataset,
  getDatasetFiles,
  getDatasetManifest,
  getDatasetFileStatistics,
  previewDatasetFile,
} from "@/lib/dataset-management";

type Dataset = Awaited<ReturnType<typeof getDataset>>;
type DatasetFile =
  Awaited<ReturnType<typeof getDatasetFiles>>["files"][number];
type Statistics =
  Awaited<ReturnType<typeof getDatasetFileStatistics>>;
type Tab = "analysis" | "prepare" | "compare" | "overview" | "files" | "statistics" | "preview" | "quality";
type Bar = { label: string; value: number };

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "analysis", label: "Analysis & EDA" },
  { key: "prepare", label: "Prepare dataset" },
  { key: "compare", label: "Compare versions" },
  { key: "files", label: "Files" },
  { key: "statistics", label: "Statistics" },
  { key: "preview", label: "Preview" },
  { key: "quality", label: "Quality" },
];

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-4)",
  "var(--chart-3)",
  "var(--chart-5)",
];

const PAGE_SIZE = 20;
const panel = "min-w-0 rounded-[14px] border border-border bg-card";

export function DatasetDetailsWorkspace({
  datasetId,
}: {
  datasetId: string;
}) {
  // Reset local selections when navigating to a different dataset.
  return <DatasetDetails key={datasetId} datasetId={datasetId} />;
}

function DatasetDetails({ datasetId }: { datasetId: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  const query = useQuery({
    queryKey: ["datasets", "detail", datasetId],
    queryFn: () => getDataset(datasetId),
  });

  if (query.isPending) return <State message="Loading dataset…" loading />;
  if (query.isError) {
    return (
      <State
        message="Dataset could not be loaded."
        retry={() => void query.refetch()}
      />
    );
  }

  const dataset = query.data;
  const summary = [
    { label: "Total samples", value: number(dataset.total_samples) },
    { label: "Training rows", value: number(dataset.train_samples) },
    { label: "Validation rows", value: number(dataset.validation_samples) },
    { label: "Test rows", value: number(dataset.test_samples) },
  ];

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background text-foreground">
      <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Link
          href="/datasets"
          className="gh-link mb-5 inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="size-4" />
          Dataset registry
        </Link>

        <header className="flex flex-col justify-between gap-5 xl:flex-row">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-2">
              <span className="gh-badge">{taskName(dataset.task)}</span>
              <span className="gh-badge">Version {dataset.version}</span>
            </div>
            <h1 className="break-words text-2xl font-bold tracking-tight">
              {dataset.name}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {dataset.description || "No description provided."}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-start gap-2">
            <button
              type="button"
              className="gh-button"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              <RefreshCw
                className={`size-4 ${query.isFetching ? "animate-spin" : ""}`}
              />
              Refresh metadata
            </button>
            <Link
              href={`/experiments/new?datasetId=${dataset.id}`}
              className="gh-button gh-button-primary"
            >
              Use in experiment
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </header>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summary.map((item) => (
            <Metric key={item.label} {...item} />
          ))}
        </div>

        <nav
          aria-label="Dataset detail sections"
          className="mt-6 flex gap-2 overflow-x-auto border-b border-border pb-3"
        >
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={tab === item.key}
              aria-controls="dataset-section"
              onClick={() => setTab(item.key)}
              className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                tab === item.key
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <section
          id="dataset-section"
          aria-label={TABS.find((item) => item.key === tab)?.label}
          className="mt-5"
        >
          {tab === "overview" && <Overview dataset={dataset} />}
          {(["analysis", "prepare", "compare"].includes(tab)) && <DatasetResearchWorkspace key={tab} dataset={dataset} initialTab={tab as "analysis" | "prepare" | "compare"} />}
          {tab === "files" && <FilesPanel dataset={dataset} />}
          {tab === "statistics" && (
            <FileWorkspace datasetId={dataset.id} mode="statistics" />
          )}
          {tab === "preview" && (
            <FileWorkspace datasetId={dataset.id} mode="preview" />
          )}
          {tab === "quality" && (
            <div className={`${panel} overflow-hidden`}>
              <div className="p-4"><button className="gh-button gh-button-primary" onClick={() => setTab("analysis")}>Open actionable readiness checklist</button><p className="mt-2 text-xs text-muted-foreground">Inspect affected rows, label conflicts and split overlap in Analysis & EDA. Legacy integrity checks remain below.</p></div><DatasetQualityReport datasetId={dataset.id} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Overview({ dataset }: { dataset: Dataset }) {
  const splits = [
    { label: "Training", value: dataset.train_samples },
    { label: "Validation", value: dataset.validation_samples },
    { label: "Test", value: dataset.test_samples },
  ];
  const splitTotal = splits.reduce((sum, item) => sum + item.value, 0);

  const metadata = [
    ["Name", dataset.name],
    ["Version", dataset.version],
    ["Task", taskName(dataset.task)],
    ["Source", dataset.source_name],
    ["Source URL", dataset.source_url],
    ["License", dataset.license_name],
    ["Created", date(dataset.created_at)],
    ["Updated", date(dataset.updated_at)],
    ["Dataset ID", dataset.id],
    ["Manifest path", dataset.manifest_path],
    ["Checksum", dataset.checksum],
  ];

  return (
    <div className="space-y-5">
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <BarChart
          title="Training split"
          description="Registered row counts for this dataset version."
          bars={splits}
          denominator={splitTotal}
          percentageLabel="Percentage of registered split rows"
        />

        <Panel title="Registration and readiness">
          <div className="space-y-4 text-sm">
            <Info label="Registration" value="Registered" />
            <Info
              label="Manifest reference"
              value={dataset.manifest_path ? "Recorded" : "Not recorded"}
            />
            <Info
              label="Checksum"
              value={dataset.checksum ? "Recorded" : "Not recorded"}
            />
            <Info
              label="Registered split rows"
              value={`${number(splitTotal)} / ${number(dataset.total_samples)}`}
            />
            <p className="rounded-xl bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
              Registration and a recorded checksum do not confirm file integrity
              or training readiness. Use the Quality tab for the backend’s
              checks.
            </p>
            {splitTotal !== dataset.total_samples && (
              <p className="text-sm text-[var(--gh-attention-fg)]">
                Split counts differ from the registered sample total. Review
                the dataset before training.
              </p>
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Dataset metadata">
        <dl className="divide-y divide-border">
          {metadata.map(([label, value]) => (
            <div
              key={label}
              className="grid gap-1 py-3 text-sm sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4"
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words">{value || "Not provided"}</dd>
            </div>
          ))}
        </dl>
        <JsonDisclosure title="Label schema" value={dataset.label_schema} />
        <JsonDisclosure
          title="Preprocessing configuration"
          value={dataset.preprocessing_config}
        />
      </Panel>
    </div>
  );
}

function FilesPanel({ dataset }: { dataset: Dataset }) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState("");

  const files = useQuery({
    queryKey: ["datasets", "detail", dataset.id, "files"],
    queryFn: () => getDatasetFiles(dataset.id),
  });
  const manifest = useQuery({
    queryKey: ["datasets", "detail", dataset.id, "manifest"],
    queryFn: () => getDatasetManifest(dataset.id),
    enabled: Boolean(dataset.manifest_path),
    retry: false,
  });

  async function download(file: DatasetFile) {
    setDownloading(file.key);
    setDownloadError("");
    try {
      await downloadDatasetFile(dataset.id, file.key, file.filename);
    } catch {
      setDownloadError(`Could not download ${file.filename}. Please retry.`);
    } finally {
      setDownloading(null);
    }
  }

  if (files.isPending) return <State message="Loading file inventory…" loading />;
  if (files.isError) {
    return (
      <State
        message="File inventory could not be loaded."
        retry={() => void files.refetch()}
      />
    );
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel
        title="Dataset files"
        description={`${files.data.available_files} of ${files.data.total_files} files available`}
        action={
          <button
            type="button"
            className="gh-button"
            disabled={files.isFetching || manifest.isFetching}
            onClick={() => {
              void files.refetch();
              if (dataset.manifest_path) void manifest.refetch();
            }}
          >
            <RefreshCw className="size-4" />
            Refresh
          </button>
        }
      >
        {downloadError && (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {downloadError}
          </p>
        )}
        {files.data.files.length === 0 ? (
          <p className="text-sm text-muted-foreground">No files registered.</p>
        ) : (
          <div className="divide-y divide-border">
            {files.data.files.map((file) => (
              <article
                key={file.key}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold">
                    {file.filename}
                  </p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {file.key} · {fileSize(file.size_bytes)} · {file.media_type}
                  </p>
                  <p
                    className={`mt-1 text-xs ${
                      file.exists
                        ? "text-[var(--gh-success-fg)]"
                        : "text-destructive"
                    }`}
                  >
                    {file.exists ? "Available" : "Missing"}
                  </p>
                  {file.checksum_sha256 && (
                    <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                      SHA-256: {file.checksum_sha256}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="gh-button"
                  disabled={!file.exists || downloading !== null}
                  onClick={() => void download(file)}
                  aria-label={`Download ${file.filename}`}
                >
                  {downloading === file.key ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  Download
                </button>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <div className="space-y-5">
        <Panel title="File inventory">
          <div className="space-y-3">
            <Info label="Manifest type" value={files.data.manifest_type} />
            <Info label="Total files" value={number(files.data.total_files)} />
            <Info label="Available" value={number(files.data.available_files)} />
            <Info
              label="Missing"
              value={number(files.data.missing_files.length)}
            />
          </div>
          {files.data.missing_files.length > 0 && (
            <ul className="mt-4 space-y-2 text-xs text-destructive">
              {files.data.missing_files.map((file) => (
                <li key={file} className="break-all">{file}</li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Manifest">
          {!dataset.manifest_path ? (
            <p className="text-sm text-muted-foreground">No manifest recorded.</p>
          ) : manifest.isPending ? (
            <State message="Loading manifest…" loading />
          ) : manifest.isError ? (
            <State
              message="Manifest could not be loaded."
              retry={() => void manifest.refetch()}
            />
          ) : (
            <>
              <Info label="Type" value={manifest.data.manifest_type} />
              <p className="mt-3 break-all text-xs text-muted-foreground">
                {manifest.data.manifest_path}
              </p>
              <JsonDisclosure title="View manifest JSON" value={manifest.data.manifest} />
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

function FileWorkspace({
  datasetId,
  mode,
}: {
  datasetId: string;
  mode: "statistics" | "preview";
}) {
  const [selectedKey, setSelectedKey] = useState("");
  const files = useQuery({
    queryKey: ["datasets", "detail", datasetId, "files"],
    queryFn: () => getDatasetFiles(datasetId),
  });

  // Existing statistics and preview workflows operate on tabular CSV files.
  const available = files.data?.files.filter(
    (file) =>
      file.exists &&
      (file.media_type.includes("csv") || file.filename.toLowerCase().endsWith(".csv")),
  ) ?? [];

  const key = available.some((file) => file.key === selectedKey)
    ? selectedKey
    : available[0]?.key ?? "";

  if (files.isPending) return <State message="Loading available files…" loading />;
  if (files.isError) {
    return (
      <State
        message="Available files could not be loaded."
        retry={() => void files.refetch()}
      />
    );
  }
  if (!key) return <State message="No available CSV files for this section." />;

  return (
    <div className="space-y-5">
      <div className={`${panel} flex flex-wrap items-center justify-between gap-3 p-4`}>
        <label htmlFor={`file-${mode}`} className="text-sm font-medium">
          {mode === "statistics" ? "Analyse file" : "Preview file"}
        </label>
        <select
          id={`file-${mode}`}
          className="gh-input !w-full sm:!w-auto sm:max-w-md"
          value={key}
          onChange={(event) => setSelectedKey(event.target.value)}
        >
          {available.map((file) => (
            <option key={file.key} value={file.key}>{file.filename}</option>
          ))}
        </select>
      </div>

      {mode === "statistics" ? (
        <StatisticsPanel key={key} datasetId={datasetId} fileKey={key} />
      ) : (
        <PreviewPanel key={key} datasetId={datasetId} fileKey={key} />
      )}
    </div>
  );
}

function StatisticsPanel({
  datasetId,
  fileKey,
}: {
  datasetId: string;
  fileKey: string;
}) {
  const query = useQuery({
    queryKey: ["datasets", "statistics", datasetId, fileKey],
    queryFn: () => getDatasetFileStatistics(datasetId, fileKey),
  });

  if (query.isPending) return <State message="Calculating file statistics…" loading />;
  if (query.isError) {
    return (
      <State
        message="File statistics could not be loaded."
        retry={() => void query.refetch()}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Statistics returned by the backend for {query.data.filename}.
        </p>
        <button
          type="button"
          className="gh-button"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} />
          Refresh statistics
        </button>
      </div>
      <StatisticsContent statistics={query.data} />
    </div>
  );
}

function StatisticsContent({ statistics: s }: { statistics: Statistics }) {
  const labels = Object.entries(s.label_distribution).map(
    ([label, value]) => ({ label, value }),
  );
  const missing = Object.entries(s.missing_values).map(
    ([label, value]) => ({ label, value }),
  );
  const labelledRows = labels.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Rows" value={number(s.total_rows)} />
        <Metric label="Columns" value={number(s.total_columns)} />
        <Metric label="Duplicate text rows" value={number(s.duplicate_text_rows)} />
        <Metric label="Rows with replacement characters" value={number(s.replacement_character_rows)} />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <BarChart
          title="Class distribution"
          description={`${s.label_column ?? "No label column detected"} · ${number(labelledRows)} counted labels`}
          bars={labels}
          denominator={labelledRows}
          percentageLabel="Percentage of counted labels"
        />
        <BarChart
          title="Missing values by column"
          description="Missing counts can overlap across columns."
          bars={missing}
          denominator={s.total_rows}
          percentageLabel="Percentage of file rows per column"
        />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Panel title="Text length" description="Character counts reported by the backend.">
          <div className="grid grid-cols-2 gap-3">
            <SmallMetric label="Minimum" value={number(s.text_length.minimum)} />
            <SmallMetric label="Average" value={number(s.text_length.average)} />
            <SmallMetric label="Maximum" value={number(s.text_length.maximum)} />
            <SmallMetric label="Measured texts" value={number(s.text_length.count)} />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            These are summary statistics. A length histogram requires individual
            lengths or histogram bins, which this endpoint does not return.
          </p>
        </Panel>
        <Panel title="Detected structure">
          <div className="space-y-4">
            <Info label="Text column" value={s.text_column ?? "Not detected"} />
            <Info label="Label column" value={s.label_column ?? "Not detected"} />
            <Info label="Unique text rows" value={number(s.unique_text_rows)} />
            <Info label="Counted labels" value={number(labelledRows)} />
          </div>
        </Panel>
      </div>

      <Panel title="Column completeness" description="Exact returned counts; unavailable values are shown as —.">
        <div className="overflow-x-auto">
          <table className="gh-table">
            <thead>
              <tr>
                <th scope="col">Column</th>
                <th scope="col">Missing</th>
                <th scope="col">Unique values</th>
              </tr>
            </thead>
            <tbody>
              {s.columns.map((column) => (
                <tr key={column}>
                  <th scope="row" className="!bg-transparent !font-normal">{column}</th>
                  <td>{number(s.missing_values[column])}</td>
                  <td>{number(s.unique_values[column])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function PreviewPanel({
  datasetId,
  fileKey,
}: {
  datasetId: string;
  fileKey: string;
}) {
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: ["datasets", "detail", datasetId, "preview", fileKey, offset],
    queryFn: () =>
      previewDatasetFile(datasetId, fileKey, { limit: PAGE_SIZE, offset }),
  });

  if (query.isPending) return <State message="Loading dataset rows…" loading />;
  if (query.isError) {
    return (
      <State
        message="Preview could not be loaded."
        retry={() => void query.refetch()}
      />
    );
  }

  const data = query.data;

  return (
    <Panel
      title="Dataset preview"
      description={`${data.filename} · ${number(data.total_rows)} rows`}
      action={
        <button
          type="button"
          className="gh-button"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw className="size-4" /> Refresh
        </button>
      }
    >
      {data.rows.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">No rows on this page.</p>
      ) : (
        <div className="max-h-[600px] overflow-auto rounded-xl border border-border">
          <table className="gh-table min-w-[600px]">
            <thead>
              <tr>
                <th scope="col">Row</th>
                {data.columns.map((column) => (
                  <th key={column} scope="col">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, index) => (
                <tr key={data.offset + index} className="align-top">
                  <td>{data.offset + index + 1}</td>
                  {data.columns.map((column) => (
                    <td key={column}>
                      <div className="min-w-32 max-w-lg whitespace-pre-wrap break-words leading-6">
                        {display(row[column])}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <footer className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Rows {data.rows.length ? data.offset + 1 : 0}–
          {data.rows.length ? data.offset + data.rows.length : 0} of {number(data.total_rows)}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="gh-button"
            disabled={!data.has_previous || query.isFetching}
            onClick={() => setOffset(Math.max(0, data.offset - PAGE_SIZE))}
          >
            Previous
          </button>
          <button
            type="button"
            className="gh-button"
            disabled={!data.has_next || query.isFetching}
            onClick={() => setOffset(data.offset + PAGE_SIZE)}
          >
            Next
          </button>
        </div>
      </footer>
    </Panel>
  );
}

function BarChart({ title, description, bars, denominator, percentageLabel }: {
  title: string; description: string; bars: Bar[];
  denominator: number; percentageLabel: string;
}) {
  const [percent, setPercent] = useState(false);
  const [sort, setSort] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"columns" | "donut">("columns");
  const valid = bars.filter((bar) => Number.isFinite(bar.value) && bar.value >= 0);
  const ordered = sort ? [...valid].sort((a, b) => b.value - a.value) : valid;
  const total = valid.reduce((sum, bar) => sum + bar.value, 0);
  const active = valid.find((bar) => bar.label === selected);
  const maximum = Math.max(0, ...valid.map((bar) => bar.value));
  const donutAllowed = total > 0 && Math.abs(total - denominator) < 0.000001
    && !percentageLabel.toLowerCase().includes("per column");
  const showDonut = view === "donut" && donutAllowed;
  const width = Math.max(520, ordered.length * 100 + 90);
  const left = 68, bottom = 240, plotHeight = 210;
  const slot = (width - left - 24) / Math.max(1, ordered.length);
  const magnitude = maximum > 0 ? 10 ** Math.floor(Math.log10(maximum)) : 1;
  const axisMax = percent ? 100 : Math.max(1, Math.ceil(maximum / magnitude) * magnitude);
  const color = (label: string) => COLORS[Math.max(0, valid.findIndex((bar) => bar.label === label)) % COLORS.length];
  const share = (value: number) => denominator > 0 ? value / denominator * 100 : 0;
  const valueLabel = (value: number) => percent ? denominator > 0 ? `${share(value).toFixed(1)}%` : "—" : number(value);
  const short = (label: string) => {
    const text = label.replaceAll("_", " ");
    return text.length > 17 ? `${text.slice(0, 15)}…` : text;
  };
  const segments = ordered.map((bar, index) => {
    const start = total > 0 ? ordered.slice(0, index).reduce((sum, item) => sum + item.value, 0) / total * 100 : 0;
    const percentage = total > 0 ? bar.value / total * 100 : 0;
    return { ...bar, start, percentage };
  });
  return (
    <figure className={`${panel} p-5`}>
      <figcaption>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </figcaption>
      {valid.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">No chart data returned.</p> : <>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2" aria-label={`${title} chart type`}>
            <button type="button" className="gh-button" aria-pressed={!showDonut} onClick={() => setView("columns")}>Columns</button>
            {donutAllowed && <button type="button" className="gh-button" aria-pressed={showDonut} onClick={() => setView("donut")}>Donut</button>}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={sort} onChange={(event) => setSort(event.target.checked)} className="size-4 accent-[var(--primary)]" />Largest first
          </label>
        </div>
        {!showDonut && <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={percent} onChange={(event) => setPercent(event.target.checked)} className="size-4 accent-[var(--primary)]" />{percentageLabel}
        </label>}
        {percent && denominator <= 0 && !showDonut ? <p className="py-12 text-center text-sm text-muted-foreground">Percentages are unavailable because the denominator is zero. Switch to counts.</p> : showDonut ? <div className="mt-4">
          <svg viewBox="0 0 360 280" className="mx-auto h-64 w-full max-w-sm" role="img" aria-label={`${title}: ${ordered.map((bar) => `${bar.label} ${number(bar.value)}`).join(", ")}`}>
            <title>{title}</title>
            <circle cx="180" cy="138" r="94" fill="none" stroke="var(--muted)" strokeWidth="34" />
            {segments.map((segment) => <circle key={segment.label} cx="180" cy="138" r="94" pathLength="100" fill="none" stroke={color(segment.label)} strokeWidth={active?.label === segment.label ? 40 : 34}
              strokeDasharray={`${segment.percentage} ${100 - segment.percentage}`} strokeDashoffset={-segment.start} transform="rotate(-90 180 138)"
              opacity={active && active.label !== segment.label ? 0.35 : 1} className="transition-opacity">
              <title>{segment.label}: {number(segment.value)} · {segment.percentage.toFixed(1)}%</title>
            </circle>)}
            <text x="180" y="130" textAnchor="middle" fill="var(--foreground)" fontSize="28" fontWeight="700">{number(active?.value ?? total)}</text>
            <text x="180" y="156" textAnchor="middle" fill="var(--muted-foreground)" fontSize="12">{active ? short(active.label) : "Total counted"}</text>
          </svg>
          <p className="text-center text-xs text-muted-foreground">Segments show shares of {number(total)} counted rows.</p>
        </div> : <div className="mt-4 overflow-x-auto">
          <svg viewBox={`0 0 ${width} 310`} className="block w-full" style={{ minWidth: ordered.length > 5 ? width : 320 }} role="img" aria-label={`${title}: ${ordered.map((bar) => `${bar.label} ${valueLabel(bar.value)}`).join(", ")}`}>
            <title>{title}</title>
            {[0, 1, 2, 3, 4].map((tick) => {
              const y = bottom - tick / 4 * plotHeight;
              const value = tick / 4 * axisMax;
              return <g key={tick}>
                <line x1={left} y1={y} x2={width - 24} y2={y} stroke="var(--border)" strokeDasharray={tick === 0 ? undefined : "4 5"} />
                <text x={left - 10} y={y + 4} textAnchor="end" fill="var(--muted-foreground)" fontSize="11">{percent ? `${value}%` : number(value)}</text>
              </g>;
            })}
            <line x1={left} y1="30" x2={left} y2={bottom} stroke="var(--border)" />
            {ordered.map((bar, index) => {
              const value = percent ? share(bar.value) : bar.value;
              const height = Math.min(value / axisMax, 1) * plotHeight;
              const x = left + slot * index + slot / 2;
              const y = bottom - height;
              const barWidth = Math.min(76, slot * 0.56);
              return <g key={bar.label}>
                <rect x={x - barWidth / 2} y={y} width={barWidth} height={height} rx="5" fill={color(bar.label)} opacity={active && active.label !== bar.label ? 0.35 : 1} className="transition-opacity">
                  <title>{bar.label}: {number(bar.value)}{denominator > 0 ? ` · ${share(bar.value).toFixed(1)}%` : ""}</title>
                </rect>
                <text x={x} y={Math.max(14, y - 8)} textAnchor="middle" fill="var(--foreground)" fontSize="12" fontWeight="600">{valueLabel(bar.value)}</text>
                <text x={x} y={bottom + 23} textAnchor="middle" fill="var(--muted-foreground)" fontSize="11">{short(bar.label)}</text>
              </g>;
            })}
            <text x={left + (width - left - 24) / 2} y="299" textAnchor="middle" fill="var(--muted-foreground)" fontSize="11">{percent ? percentageLabel : "Registered / returned counts"}</text>
          </svg>
        </div>}
        {maximum === 0 && <p className="mt-2 text-sm text-muted-foreground">All returned counts are zero; no columns rise above the baseline.</p>}
        <div className="mt-4 flex flex-wrap gap-2" aria-label={`${title} legend: select a category to highlight`}>
          {ordered.map((bar) => <button key={bar.label} type="button" onClick={() => setSelected(selected === bar.label ? null : bar.label)} aria-pressed={selected === bar.label}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${selected === bar.label ? "border-primary bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}>
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color(bar.label) }} />{bar.label.replaceAll("_", " ")}
          </button>)}
        </div>
        <div aria-live="polite" className="mt-3 text-sm">
          {active ? <p className="rounded-xl bg-muted/60 p-3"><strong>{active.label.replaceAll("_", " ")}</strong>: {number(active.value)}{denominator > 0 && ` · ${share(active.value).toFixed(1)}%`}</p>
            : <p className="text-xs text-muted-foreground">Hover over a plotted segment for details. Select a legend item to highlight it, including with the keyboard.</p>}
        </div>
      </>}
    </figure>
  );
}

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={panel}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && (
            <p className="mt-1 break-words text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </header>
      <div className="min-w-0 p-4 sm:p-5">{children}</div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${panel} p-5`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-3 break-words text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 break-words text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-words font-medium">{value}</span>
    </div>
  );
}

function JsonDisclosure({ title, value }: { title: string; value: unknown }) {
  return (
    <details className="mt-4 rounded-xl border border-border">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{title}</summary>
      <pre className="max-h-80 overflow-auto border-t border-border bg-muted/40 p-4 text-xs leading-relaxed">
        {value == null ? "Not provided" : JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function State({
  message,
  loading = false,
  retry,
}: {
  message: string;
  loading?: boolean;
  retry?: () => void;
}) {
  return (
    <div
      role={retry ? "alert" : "status"}
      className={`${panel} flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center`}
    >
      {loading ? (
        <RefreshCw className="size-5 animate-spin text-muted-foreground" />
      ) : (
        <Database className="size-5 text-muted-foreground" />
      )}
      <p className="text-sm text-muted-foreground">{message}</p>
      {retry && (
        <button type="button" className="gh-button" onClick={retry}>Try again</button>
      )}
    </div>
  );
}

function number(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString(undefined, { maximumFractionDigits: 1 })
    : "—";
}

function date(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Unknown"
    : parsed.toLocaleString("en", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function taskName(value: string) {
  if (value === "hate_speech") return "Hate speech";
  if (value === "sentiment") return "Sentiment";
  return value.replaceAll("_", " ");
}

function display(value: unknown): string {
  if (value == null || value === "") return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function fileSize(bytes: number | null) {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "Unknown size";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}
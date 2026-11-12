"use client";

import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  FileJson2,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  XCircle,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  downloadDatasetExport,
  downloadDatasetExportManifest,
  listDatasetExports,
  deleteDatasetExport,
} from "@/lib/datasets";
import { getApiErrorMessage } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";

import type {
  DatasetExportRead,
  DatasetExportStatus,
} from "@/types/dataset-export";

function formatWords(value?: string | null): string {
  if (!value) {
    return "—";
  }

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function getStatusClass(status: DatasetExportStatus): string {
  if (status === "completed") {
    return (
      "border-emerald-300 bg-emerald-50 text-emerald-700 " +
      "dark:border-emerald-900 dark:bg-emerald-950/30 " +
      "dark:text-emerald-300"
    );
  }

  if (status === "failed") {
    return (
      "border-red-300 bg-red-50 text-red-700 " +
      "dark:border-red-900 dark:bg-red-950/30 " +
      "dark:text-red-300"
    );
  }

  if (status === "processing") {
    return (
      "border-blue-300 bg-blue-50 text-blue-700 " +
      "dark:border-blue-900 dark:bg-blue-950/30 " +
      "dark:text-blue-300"
    );
  }

  return (
    "border-amber-300 bg-amber-50 text-amber-700 " +
    "dark:border-amber-900 dark:bg-amber-950/30 " +
    "dark:text-amber-300"
  );
}

function ExportStatusIcon({ status }: { status: DatasetExportStatus }) {
  const iconClassName = cn(
    "size-3.5",
    status === "processing" && "animate-spin",
  );

  if (status === "completed") {
    return <CheckCircle2 className={iconClassName} aria-hidden="true" />;
  }

  if (status === "failed") {
    return <XCircle className={iconClassName} aria-hidden="true" />;
  }

  if (status === "processing") {
    return <LoaderCircle className={iconClassName} aria-hidden="true" />;
  }

  return <Clock3 className={iconClassName} aria-hidden="true" />;
}

function ExportStatusBadge({ status }: { status: DatasetExportStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border",
        "px-2.5 py-1 text-xs font-medium",
        getStatusClass(status),
      )}
    >
      <ExportStatusIcon status={status} />

      {formatWords(status)}
    </span>
  );
}

function ExportHistoryCard({
  exportRecord,
  onDownload,
  onDownloadManifest,
  downloadingExportId,
  downloadingManifestId,
  onDelete,
}: {
  onDelete?: (record: DatasetExportRead) => void;
  exportRecord: DatasetExportRead;
  onDownload: (record: DatasetExportRead) => void;
  onDownloadManifest: (record: DatasetExportRead) => void;
  downloadingExportId: string | null;
  downloadingManifestId: string | null;
}) {
  const isCompleted = exportRecord.status === "completed";

  const isDownloadingExport = downloadingExportId === exportRecord.id;

  const isDownloadingManifest = downloadingManifestId === exportRecord.id;

  return (
    <article className="rounded-lg border bg-background p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ExportStatusBadge status={exportRecord.status} />

            <span className="rounded-full border px-2.5 py-1 text-xs font-medium">
              {exportRecord.export_format.toUpperCase()}
            </span>

            <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
              {formatWords(exportRecord.task)}
            </span>
          </div>

          <h4 className="mt-3 break-words text-base font-semibold">
            {exportRecord.name}
          </h4>

          <p className="mt-1 text-sm text-muted-foreground">
            Version {exportRecord.version}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {onDelete && <Button type="button" size="sm" variant="outline" className="text-destructive" disabled={exportRecord.status !== "completed" && exportRecord.status !== "failed"} onClick={() => onDelete(exportRecord)}><Trash2 className="mr-2 size-4" />Delete</Button>}

          <Button
            type="button"
            size="sm"
            disabled={!isCompleted || isDownloadingExport}
            onClick={() => onDownload(exportRecord)}
          >
            {isDownloadingExport ? (
              <LoaderCircle className="mr-2 size-4 animate-spin" />
            ) : (
              <Download className="mr-2 size-4" />
            )}
            Download
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={
              !isCompleted ||
              !exportRecord.manifest_path ||
              isDownloadingManifest
            }
            onClick={() => onDownloadManifest(exportRecord)}
          >
            {isDownloadingManifest ? (
              <LoaderCircle className="mr-2 size-4 animate-spin" />
            ) : (
              <FileJson2 className="mr-2 size-4" />
            )}
            Manifest
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <ExportMetric label="Selected" value={exportRecord.selected_records} />

        <ExportMetric label="Exported" value={exportRecord.exported_records} />

        <ExportMetric label="Skipped" value={exportRecord.skipped_records} />
      </div>

      <dl className="mt-5 grid gap-4 border-t pt-5 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <ExportDetail
          label="Created"
          value={formatDateTime(exportRecord.created_at)}
        />

        <ExportDetail
          label="Completed"
          value={formatDateTime(exportRecord.completed_at)}
        />

        <ExportDetail
          label="Dataset version ID"
          value={exportRecord.dataset_version_id ?? "Not registered"}
          mono
        />

        <ExportDetail
          label="Checksum"
          value={exportRecord.checksum ?? "Not available"}
          mono
        />
      </dl>

      {exportRecord.status === "failed" && (
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/20">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" />

            <div>
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                Export failed
              </p>

              <p className="mt-1 break-words text-sm text-red-700/80 dark:text-red-300/80">
                {exportRecord.error_message ??
                  "The backend did not provide an error message."}
              </p>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function ExportMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-muted/20 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>

      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function ExportDetail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>

      <dd
        className={cn(
          "mt-1 break-words font-medium",
          mono && "break-all font-mono text-xs",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function DatasetExportHistory() {
  const admin = useAuthStore(state => state.user?.role === "admin");
  const client = useQueryClient();
  const [deleteTarget, setDeleteTarget] = React.useState<DatasetExportRead | null>(null);
  const [deleteError, setDeleteError] = React.useState("");
  const deletion = useMutation({
    mutationFn: deleteDatasetExport,
    retry: false,
    onSuccess: async () => {
      setDeleteTarget(null);
      toast.success("Export history entry deleted.");
      await client.invalidateQueries({ queryKey: ["datasets", "exports"] });
    },
    onError: error => setDeleteError(getApiErrorMessage(error, "Unable to delete this export history entry.")),
  });

  const exportHistoryQuery = useQuery({
    queryKey: ["datasets", "exports"],
    queryFn: () => listDatasetExports(100, 0),
    refetchInterval: (query) => {
      const records = query.state.data;

      const hasActiveExport = records?.some(
        (record) =>
          record.status === "pending" || record.status === "processing",
      );

      return hasActiveExport ? 3_000 : false;
    },
  });

  const [downloadingExportId, setDownloadingExportId] = React.useState<
    string | null
  >(null);

  const [downloadingManifestId, setDownloadingManifestId] = React.useState<
    string | null
  >(null);

  async function handleDownload(exportRecord: DatasetExportRead) {
    setDownloadingExportId(exportRecord.id);

    try {
      await downloadDatasetExport(exportRecord);

      toast.success("Dataset downloaded.", {
        description:
          `${exportRecord.exported_records} exported records · ` +
          exportRecord.export_format.toUpperCase(),
      });
    } catch (error) {
      toast.error("Dataset download failed.", {
        description: getApiErrorMessage(
          error,
          "Unable to download the selected dataset export.",
        ),
      });
    } finally {
      setDownloadingExportId(null);
    }
  }

  async function handleDownloadManifest(exportRecord: DatasetExportRead) {
    setDownloadingManifestId(exportRecord.id);

    try {
      await downloadDatasetExportManifest(exportRecord);

      toast.success("Export manifest downloaded.");
    } catch (error) {
      toast.error("Manifest download failed.", {
        description: getApiErrorMessage(
          error,
          "Unable to download the dataset export manifest.",
        ),
      });
    } finally {
      setDownloadingManifestId(null);
    }
  }

  if (exportHistoryQuery.isLoading) {
    return (
      <section className="gh-panel p-6">
        <div className="flex items-center gap-3">
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" />

          <p className="text-sm text-muted-foreground">
            Loading dataset export history…
          </p>
        </div>
      </section>
    );
  }

  if (exportHistoryQuery.isError) {
    return (
      <section className="gh-panel p-6">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle className="size-5" />
        </div>

        <h3 className="mt-4 text-lg font-semibold">
          Dataset export history could not load
        </h3>

        <p className="mt-2 text-sm text-muted-foreground">
          {getApiErrorMessage(
            exportHistoryQuery.error,
            "Unable to load dataset export history.",
          )}
        </p>

        <Button
          type="button"
          className="mt-5"
          onClick={() => {
            void exportHistoryQuery.refetch();
          }}
        >
          <RotateCcw className="mr-2 size-4" />
          Try again
        </Button>
      </section>
    );
  }

  const exports = exportHistoryQuery.data ?? [];

  const completedCount = exports.filter(
    (record) => record.status === "completed",
  ).length;

  const failedCount = exports.filter(
    (record) => record.status === "failed",
  ).length;

  const activeCount = exports.filter(
    (record) => record.status === "pending" || record.status === "processing",
  ).length;

  return (
    <section className="gh-panel">
      <header className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300">
            <Database className="size-5" />
          </div>

          <div>
            <h3 className="text-lg font-semibold">Dataset Export History</h3>

            <p className="mt-1 text-sm text-muted-foreground">
              Review, download, and inspect previously generated dataset
              artifacts.
            </p>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border px-2.5 py-1">
                {exports.length} total
              </span>

              <span className="rounded-full border px-2.5 py-1">
                {completedCount} completed
              </span>

              <span className="rounded-full border px-2.5 py-1">
                {activeCount} active
              </span>

              <span className="rounded-full border px-2.5 py-1">
                {failedCount} failed
              </span>
            </div>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          disabled={exportHistoryQuery.isFetching}
          onClick={() => {
            void exportHistoryQuery.refetch();
          }}
        >
          <RefreshCw
            className={cn(
              "mr-2 size-4",
              exportHistoryQuery.isFetching && "animate-spin",
            )}
          />
          Refresh History
        </Button>
      </header>

      <div className="border-t p-4">
        {exports.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Database className="mx-auto size-10 text-muted-foreground" />

            <h4 className="mt-4 font-semibold">No dataset exports found</h4>

            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
              Create an export from the Dataset Builder and it will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {exports.map((exportRecord) => (
              <ExportHistoryCard
                key={exportRecord.id}
                exportRecord={exportRecord}
                onDelete={admin ? record => { setDeleteError(""); setDeleteTarget(record); } : undefined}
                downloadingExportId={downloadingExportId}
                downloadingManifestId={downloadingManifestId}
                onDownload={(record) => {
                  void handleDownload(record);
                }}
                onDownloadManifest={(record) => {
                  void handleDownloadManifest(record);
                }}
              />
            ))}
          </div>
        )}
      </div>
      {admin && deleteTarget && <dialog open ref={element => { if (element && !element.matches(":modal")) { element.close(); element.showModal(); } }} onCancel={event => { event.preventDefault(); if (!deletion.isPending) setDeleteTarget(null); }} aria-labelledby="delete-export-title" className="fixed inset-0 z-50 m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border bg-background p-6 text-foreground shadow-xl backdrop:bg-black/40">
        <h2 id="delete-export-title" className="text-lg font-semibold">Delete export history entry?</h2>
        <p className="mt-3 break-words font-medium">{deleteTarget.name} · v{deleteTarget.version} · {deleteTarget.export_format.toUpperCase()}</p>
        <p className="mt-1 text-xs text-muted-foreground">Created {formatDateTime(deleteTarget.created_at)}</p>
        <p className="mt-3 text-sm text-muted-foreground">This permanently removes this entry and its download links from export history. Feedback, registered datasets and saved files are preserved.</p>
        {deleteError && <p role="alert" className="mt-3 text-sm text-destructive">{deleteError}</p>}
        <div className="mt-6 flex justify-end gap-2"><Button variant="outline" disabled={deletion.isPending} onClick={() => setDeleteTarget(null)}>Cancel</Button><Button variant="destructive" disabled={deletion.isPending} onClick={() => deletion.mutate(deleteTarget.id)}>{deletion.isPending ? "Deleting…" : "Delete entry"}</Button></div>
      </dialog>}
    </section>
  );
}

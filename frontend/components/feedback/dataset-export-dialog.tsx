"use client";

import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileJson2,
  FileSpreadsheet,
  LoaderCircle,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createDatasetExport, downloadDatasetExport } from "@/lib/datasets";
import { getApiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

import type {
  DatasetExportCreate,
  DatasetExportFormat,
  DatasetExportTask,
} from "@/types/dataset-export";
import type { DatasetBuilderItem } from "@/types/feedback";

type DatasetExportDialogProps = {
  open: boolean;
  selectedItems: DatasetBuilderItem[];
  onOpenChange: (open: boolean) => void;
};

function formatTask(task: string): string {
  return task
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function createDefaultName(task: DatasetExportTask | null): string {
  const taskName = task ? formatTask(task) : "Research";

  return `BanglaGuard ${taskName} Dataset`;
}

export function DatasetExportDialog({
  open,
  selectedItems,
  onOpenChange,
}: DatasetExportDialogProps) {
  const queryClient = useQueryClient();

  const selectedTasks = useMemo(
    () => Array.from(new Set(selectedItems.map((item) => item.task))),
    [selectedItems],
  );

  const selectedTask = selectedTasks.length === 1 ? selectedTasks[0] : null;

  const readyItems = useMemo(
    () => selectedItems.filter((item) => item.is_dataset_ready),
    [selectedItems],
  );

  const skippedCount = selectedItems.length - readyItems.length;

  const [name, setName] = useState(() => createDefaultName(selectedTask));
  const [version, setVersion] = useState("1.0.0");
  const [exportFormat, setExportFormat] = useState<DatasetExportFormat>("csv");

  const exportMutation = useMutation({
    mutationFn: async (payload: DatasetExportCreate) => {
      const exportRecord = await createDatasetExport(payload);

      if (exportRecord.status !== "completed") {
        throw new Error(
          exportRecord.error_message ?? "The dataset export did not complete.",
        );
      }

      await downloadDatasetExport(exportRecord);

      return exportRecord;
    },

    onSuccess: (exportRecord) => {
      void queryClient.invalidateQueries({
        queryKey: ["datasets", "exports"],
      });

      toast.success("Dataset exported successfully.", {
        description:
          `${exportRecord.exported_records} records downloaded` +
          (exportRecord.skipped_records > 0
            ? ` · ${exportRecord.skipped_records} skipped`
            : ""),
      });

      onOpenChange(false);
    },

    onError: (error) => {
      toast.error("Dataset export failed.", {
        description: getApiErrorMessage(
          error,
          "Unable to create the dataset export.",
        ),
      });
    },
  });

  const normalizedName = name.trim();
  const normalizedVersion = version.trim();

  const selectionIsValid =
    selectedItems.length > 0 && readyItems.length > 0 && selectedTask !== null;

  const formIsValid =
    selectionIsValid &&
    normalizedName.length >= 2 &&
    normalizedVersion.length >= 1;

  function handleExport() {
    if (!selectedTask) {
      toast.error("Select records from one task only.", {
        description:
          "Hate Speech and Sentiment records must be exported separately.",
      });

      return;
    }

    if (readyItems.length === 0) {
      toast.error("No dataset-ready samples selected.");

      return;
    }

    if (normalizedName.length < 2) {
      toast.error("Enter a valid dataset name.");

      return;
    }

    if (!normalizedVersion) {
      toast.error("Enter a dataset version.");

      return;
    }

    exportMutation.mutate({
      name: normalizedName,
      version: normalizedVersion,
      task: selectedTask,
      export_format: exportFormat,
      selected_feedback_ids: selectedItems.map((item) => item.feedback_id),
      configuration: {
        source: "banglaguard_dataset_builder",
        dataset_ready_only: true,
        selected_from_ui: selectedItems.length,
        ready_from_ui: readyItems.length,
        skipped_from_ui: skippedCount,
      },
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (exportMutation.isPending) {
          return;
        }

        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export selected dataset</DialogTitle>

          <DialogDescription>
            Create a versioned dataset from the selected, human-reviewed
            BanglaGuard samples.
          </DialogDescription>
        </DialogHeader>

        <section className="grid gap-3 sm:grid-cols-3">
          <ExportStatistic label="Selected" value={selectedItems.length} />

          <ExportStatistic label="Dataset ready" value={readyItems.length} />

          <ExportStatistic label="Will be skipped" value={skippedCount} />
        </section>

        {selectedTasks.length > 1 ? (
          <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            <AlertCircle className="mt-0.5 size-5 shrink-0" />

            <div>
              <p className="text-sm font-semibold">
                Mixed tasks cannot be exported together
              </p>

              <p className="mt-1 text-sm">
                Your selection contains{" "}
                {selectedTasks.map(formatTask).join(" and ")} records. Select
                one task at a time.
              </p>
            </div>
          </div>
        ) : null}

        {selectedTask ? (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-4">
            <CheckCircle2 className="size-5 text-emerald-600" />

            <div>
              <p className="text-xs text-muted-foreground">Dataset task</p>

              <p className="font-semibold">{formatTask(selectedTask)}</p>
            </div>
          </div>
        ) : null}

        <div className="grid gap-5">
          <label className="grid gap-2">
            <span className="text-sm font-medium">Dataset name</span>

            <input
              type="text"
              value={name}
              maxLength={150}
              disabled={exportMutation.isPending}
              onChange={(event) => setName(event.target.value)}
              placeholder="BanglaGuard Hate Speech Dataset"
              className="gh-input w-full outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
            />

            <span className="text-xs text-muted-foreground">
              A descriptive name for the registered dataset version.
            </span>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Version</span>

            <input
              type="text"
              value={version}
              maxLength={50}
              disabled={exportMutation.isPending}
              onChange={(event) => setVersion(event.target.value)}
              placeholder="1.0.0"
              className="gh-input w-full outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
            />

            <span className="text-xs text-muted-foreground">
              Semantic versions such as 1.0.0 are recommended.
            </span>
          </label>

          <fieldset className="grid gap-3">
            <legend className="text-sm font-medium">Export format</legend>

            <div className="grid gap-3 sm:grid-cols-2">
              <FormatOption
                format="csv"
                selected={exportFormat === "csv"}
                disabled={exportMutation.isPending}
                title="CSV"
                description="Spreadsheet-compatible UTF-8 dataset."
                icon={FileSpreadsheet}
                onSelect={setExportFormat}
              />

              <FormatOption
                format="jsonl"
                selected={exportFormat === "jsonl"}
                disabled={exportMutation.isPending}
                title="JSONL"
                description="One structured JSON record per line."
                icon={FileJson2}
                onSelect={setExportFormat}
              />
            </div>
          </fieldset>
        </div>

        {skippedCount > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            {skippedCount} selected{" "}
            {skippedCount === 1 ? "record is" : "records are"} not dataset-ready
            and will not be included in the exported file.
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={exportMutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>

          <Button
            type="button"
            disabled={!formIsValid || exportMutation.isPending}
            onClick={handleExport}
          >
            {exportMutation.isPending ? (
              <LoaderCircle className="mr-2 size-4 animate-spin" />
            ) : (
              <Download className="mr-2 size-4" />
            )}

            {exportMutation.isPending
              ? "Creating export..."
              : "Create and Download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExportStatistic({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-lg border bg-background p-4">
      <p className="text-xs text-muted-foreground">{label}</p>

      <p className="mt-1 text-2xl font-bold">{value}</p>
    </article>
  );
}

function FormatOption({
  format,
  selected,
  disabled,
  title,
  description,
  icon: Icon,
  onSelect,
}: {
  format: DatasetExportFormat;
  selected: boolean;
  disabled: boolean;
  title: string;
  description: string;
  icon: typeof FileSpreadsheet;
  onSelect: (format: DatasetExportFormat) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={() => onSelect(format)}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-4 text-left transition",
        "hover:border-primary/50 hover:bg-muted/20",
        "disabled:cursor-not-allowed disabled:opacity-60",
        selected && "border-primary bg-primary/5 ring-2 ring-primary/10",
      )}
    >
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          selected
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-5" />
      </div>

      <div>
        <p className="font-semibold">{title}</p>

        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
    </button>
  );
}

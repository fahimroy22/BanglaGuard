"use client";
import { SplitImport } from "@/components/datasets/split-import";

import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Database,
  FileSpreadsheet,
  Info,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  type DragEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import {
  inspectDataset,
  registerDataset,
  validateDatasetMapping,
} from "@/lib/dataset-management";

import type {
  DatasetInspectionRead,
  DatasetLabelMapping,
  DatasetMappingValidationResponse,
  DatasetTask,
  DatasetVersionRead,
} from "@/types/dataset-management";

type UploadStep =
  | "upload"
  | "mapping"
  | "validation"
  | "complete";

type MetadataState = {
  name: string;
  version: string;
  task: DatasetTask;
  description: string;
  source_name: string;
  source_url: string;
  license_name: string;
};

type MappingRow = {
  id: string;
  source: string;
  target: string;
};

const DEFAULT_METADATA: MetadataState = {
  name: "",
  version: "1.0.0",
  task: "hate_speech",
  description: "",
  source_name: "",
  source_url: "",
  license_name: "",
};

const STEPS: Array<{
  key: UploadStep;
  title: string;
}> = [
  {
    key: "upload",
    title: "Upload",
  },
  {
    key: "mapping",
    title: "Map",
  },
  {
    key: "validation",
    title: "Validate",
  },
  {
    key: "complete",
    title: "Register",
  },
];

function createId(): string {
  return Math.random()
    .toString(36)
    .slice(2);
}

function createEmptyMappings(): MappingRow[] {
  return [
    {
      id: createId(),
      source: "",
      target: "",
    },
    {
      id: createId(),
      source: "",
      target: "",
    },
  ];
}

function SingleDatasetUploadWorkspace() {
  const queryClient = useQueryClient();

  const fileInputRef =
    useRef<HTMLInputElement>(null);

  const [step, setStep] =
    useState<UploadStep>("upload");

  const [dragActive, setDragActive] =
    useState(false);

  const [file, setFile] =
    useState<File | null>(null);

  const [inspection, setInspection] =
    useState<DatasetInspectionRead | null>(
      null,
    );

  const [validation, setValidation] =
    useState<DatasetMappingValidationResponse | null>(
      null,
    );

  const [
    registeredDataset,
    setRegisteredDataset,
  ] =
    useState<DatasetVersionRead | null>(
      null,
    );

  const [metadata, setMetadata] =
    useState<MetadataState>(
      DEFAULT_METADATA,
    );

  const [advancedOpen, setAdvancedOpen] =
    useState(false);

  const [textColumn, setTextColumn] =
    useState("");

  const [labelColumn, setLabelColumn] =
    useState("");

  const [mappingRows, setMappingRows] =
    useState<MappingRow[]>(
      createEmptyMappings,
    );

  const [dropEmptyText, setDropEmptyText] =
    useState(true);

  const [
    dropEmptyLabel,
    setDropEmptyLabel,
  ] = useState(true);

  const [
    dropDuplicates,
    setDropDuplicates,
  ] = useState(true);

  const [
    excludeReplacementCharacters,
    setExcludeReplacementCharacters,
  ] = useState(true);

  const labelMapping =
    useMemo<DatasetLabelMapping>(() => {
      const mapping: DatasetLabelMapping =
        {};

      for (const row of mappingRows) {
        const source =
          row.source.trim();

        const target =
          row.target.trim();

        if (source && target) {
          mapping[source] = target;
        }
      }

      return mapping;
    }, [mappingRows]);

  const currentStepIndex =
    STEPS.findIndex(
      (item) => item.key === step,
    );

  const inspectMutation = useMutation({
    mutationFn: inspectDataset,

    onSuccess: (result) => {
      setInspection(result);

      const suggestedText =
        result.suggested_text_column ??
        result.columns[0] ??
        "";

      const suggestedLabel =
        result.suggested_label_columns[0] ??
        result.columns.find(
          (column) =>
            column !== suggestedText,
        ) ??
        "";

      setTextColumn(suggestedText);
      setLabelColumn(suggestedLabel);

      initialiseMappingRows(
        result,
        suggestedLabel,
      );

      setMetadata((current) => ({
        ...current,
        name:
          current.name.trim() ||
          result.filename.replace(
            /\.[^.]+$/,
            "",
          ),
      }));

      toast.success(
        "File inspected successfully.",
        {
          description: `${result.total_rows.toLocaleString()} rows and ${result.total_columns} columns detected.`,
        },
      );
    },

    onError: (error) => {
      toast.error(
        "File inspection failed.",
        {
          description:
            getErrorMessage(error),
        },
      );
    },
  });

  const validationMutation =
    useMutation({
      mutationFn:
        validateDatasetMapping,

      onSuccess: (result) => {
        setValidation(result);
        setStep("validation");

        if (result.can_register) {
          toast.success(
            "Validation complete.",
            {
              description:
                "The dataset is ready to register.",
            },
          );
        } else {
          toast.warning(
            "Validation needs attention.",
            {
              description:
                "Review the failed checks before registering.",
            },
          );
        }
      },

      onError: (error) => {
        toast.error(
          "Validation failed.",
          {
            description:
              getErrorMessage(error),
          },
        );
      },
    });

  const registerMutation = useMutation({
    mutationFn: registerDataset,

    onSuccess: async (result) => {
      setRegisteredDataset(result);
      setStep("complete");

      await queryClient.invalidateQueries({
        queryKey: ["datasets"],
      });

      await queryClient.invalidateQueries({
        queryKey: ["dashboard"],
      });

      toast.success(
        "Dataset registered.",
        {
          description: `${result.name} ${result.version}`,
        },
      );
    },

    onError: (error) => {
      toast.error(
        "Registration failed.",
        {
          description:
            getErrorMessage(error),
        },
      );
    },
  });

  function initialiseMappingRows(
    result: DatasetInspectionRead,
    columnName: string,
  ) {
    const profile =
      result.column_profiles.find(
        (column) =>
          column.name === columnName,
      );

    const values = Array.from(
      new Set(
        (profile?.sample_values ?? [])
          .filter(
            (value) =>
              value !== null &&
              value !== undefined,
          )
          .map((value) =>
            String(value).trim(),
          )
          .filter(Boolean),
      ),
    );

    if (values.length >= 2) {
      setMappingRows(
        values.map((value) => ({
          id: createId(),
          source: value,
          target: value,
        })),
      );

      return;
    }

    setMappingRows(
      createEmptyMappings(),
    );
  }

  function selectFile(
    selectedFile: File | null,
  ) {
    if (!selectedFile) {
      return;
    }

    if (
      !selectedFile.name
        .toLowerCase()
        .endsWith(".csv")
    ) {
      toast.error(
        "Only CSV files are supported.",
      );
      return;
    }

    setFile(selectedFile);
    setInspection(null);
    setValidation(null);
    setRegisteredDataset(null);
    setStep("upload");

    inspectMutation.mutate(selectedFile);
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();

    setDragActive(false);

    const selectedFile =
      event.dataTransfer.files?.[0] ??
      null;

    selectFile(selectedFile);
  }

  function removeFile() {
    setFile(null);
    setInspection(null);
    setValidation(null);
    setTextColumn("");
    setLabelColumn("");
    setMappingRows(
      createEmptyMappings(),
    );

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function continueToMapping() {
    if (!inspection) {
      toast.error(
        "Wait for file inspection to finish.",
      );
      return;
    }

    setStep("mapping");
  }

  function updateMappingRow(
    id: string,
    field: "source" | "target",
    value: string,
  ) {
    setMappingRows((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              [field]: value,
            }
          : row,
      ),
    );
  }

  function addMappingRow() {
    setMappingRows((current) => [
      ...current,
      {
        id: createId(),
        source: "",
        target: "",
      },
    ]);
  }

  function removeMappingRow(id: string) {
    setMappingRows((current) => {
      if (current.length <= 2) {
        toast.error(
          "At least two mappings are required.",
        );

        return current;
      }

      return current.filter(
        (row) => row.id !== id,
      );
    });
  }

  function submitValidation() {
    if (!inspection) {
      return;
    }

    if (!textColumn || !labelColumn) {
      toast.error(
        "Select text and label columns.",
      );
      return;
    }

    if (textColumn === labelColumn) {
      toast.error(
        "Text and label columns must be different.",
      );
      return;
    }

    const distinctTargets = new Set(
      Object.values(labelMapping),
    );

    if (
      Object.keys(labelMapping).length <
        2 ||
      distinctTargets.size < 2
    ) {
      toast.error(
        "Map at least two source labels to two distinct target labels.",
      );

      return;
    }

    validationMutation.mutate({
      upload_id:
        inspection.upload_id,

      text_column: textColumn,
      label_column: labelColumn,

      label_mapping: labelMapping,

      drop_empty_text: dropEmptyText,
      drop_empty_label:
        dropEmptyLabel,
      drop_duplicates:
        dropDuplicates,

      exclude_replacement_character_rows:
        excludeReplacementCharacters,

      preview_rows: 20,
    });
  }

  function submitRegistration() {
    if (!inspection || !validation) {
      return;
    }

    if (!metadata.name.trim()) {
      toast.error(
        "Enter a dataset name.",
      );
      return;
    }

    if (!metadata.version.trim()) {
      toast.error(
        "Enter a version.",
      );
      return;
    }

    if (!validation.can_register) {
      toast.error(
        "Resolve validation problems before registering.",
      );
      return;
    }

    registerMutation.mutate({
      upload_id:
        inspection.upload_id,

      text_column: textColumn,
      label_column: labelColumn,

      label_mapping: labelMapping,

      drop_empty_text: dropEmptyText,
      drop_empty_label:
        dropEmptyLabel,
      drop_duplicates:
        dropDuplicates,

      exclude_replacement_character_rows:
        excludeReplacementCharacters,

      preview_rows: 20,

      name: metadata.name.trim(),
      version:
        metadata.version.trim(),
      task: metadata.task,

      description:
        metadata.description.trim() ||
        null,

      source_name:
        metadata.source_name.trim() ||
        null,

      source_url:
        metadata.source_url.trim() ||
        null,

      license_name:
        metadata.license_name.trim() ||
        null,
    });
  }

  function resetWorkspace() {
    setStep("upload");
    setFile(null);
    setInspection(null);
    setValidation(null);
    setRegisteredDataset(null);
    setMetadata(DEFAULT_METADATA);
    setAdvancedOpen(false);
    setTextColumn("");
    setLabelColumn("");
    setMappingRows(
      createEmptyMappings(),
    );
    setDropEmptyText(true);
    setDropEmptyLabel(true);
    setDropDuplicates(true);
    setExcludeReplacementCharacters(
      true,
    );

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="min-h-full bg-[var(--gh-canvas)]">
      <div className="workspace-container">
        <header className="flex flex-col gap-3 border-b border-[var(--gh-border-default)] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <Link
              href="/datasets"
              className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-transparent text-[var(--gh-fg-muted)] transition hover:border-[var(--gh-border-default)] hover:bg-[var(--gh-canvas-subtle)] hover:text-[var(--gh-fg-default)]"
              aria-label="Back to dataset registry"
            >
              <ArrowLeft className="size-4" />
            </Link>

            <div>
              <h1 className="text-xl font-semibold tracking-tight text-[var(--gh-fg-default)]">
                Upload dataset
              </h1>

              <p className="mt-1 text-sm text-[var(--gh-fg-muted)]">
                Prepare a CSV file for
                BanglaGuard training.
              </p>
            </div>
          </div>

          {file || inspection ? (
            <button
              type="button"
              onClick={resetWorkspace}
              className="gh-button"
            >
              <RotateCcw className="size-4" />
              Start over
            </button>
          ) : null}
        </header>

        <StepNavigation
          currentIndex={currentStepIndex}
        />

        {step === "upload" ? (
          <UploadStep
            file={file}
            inspection={inspection}
            metadata={metadata}
            advancedOpen={advancedOpen}
            dragActive={dragActive}
            inspecting={
              inspectMutation.isPending
            }
            fileInputRef={fileInputRef}
            onSelectFile={selectFile}
            onRemoveFile={removeFile}
            onDrop={handleDrop}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragActive(false);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onMetadata={setMetadata}
            onAdvancedToggle={() =>
              setAdvancedOpen(
                (current) => !current,
              )
            }
            onContinue={continueToMapping}
          />
        ) : null}

        {step === "mapping" &&
        inspection ? (
          <MappingStep
            inspection={inspection}
            textColumn={textColumn}
            labelColumn={labelColumn}
            mappingRows={mappingRows}
            dropEmptyText={dropEmptyText}
            dropEmptyLabel={
              dropEmptyLabel
            }
            dropDuplicates={
              dropDuplicates
            }
            excludeReplacementCharacters={
              excludeReplacementCharacters
            }
            validating={
              validationMutation.isPending
            }
            onTextColumn={
              setTextColumn
            }
            onLabelColumn={(value) => {
              setLabelColumn(value);

              initialiseMappingRows(
                inspection,
                value,
              );
            }}
            onMappingChange={
              updateMappingRow
            }
            onMappingAdd={addMappingRow}
            onMappingRemove={
              removeMappingRow
            }
            onDropEmptyText={
              setDropEmptyText
            }
            onDropEmptyLabel={
              setDropEmptyLabel
            }
            onDropDuplicates={
              setDropDuplicates
            }
            onExcludeReplacementCharacters={
              setExcludeReplacementCharacters
            }
            onBack={() =>
              setStep("upload")
            }
            onValidate={
              submitValidation
            }
          />
        ) : null}

        {step === "validation" &&
        validation ? (
          <ValidationStep
            validation={validation}
            metadata={metadata}
            registering={
              registerMutation.isPending
            }
            onMetadata={setMetadata}
            onBack={() =>
              setStep("mapping")
            }
            onRegister={
              submitRegistration
            }
          />
        ) : null}

        {step === "complete" &&
        registeredDataset ? (
          <CompleteStep
            dataset={
              registeredDataset
            }
            onRestart={resetWorkspace}
          />
        ) : null}
      </div>
    </div>
  );
}

type UploadStepProps = {
  file: File | null;

  inspection:
    | DatasetInspectionRead
    | null;

  metadata: MetadataState;

  advancedOpen: boolean;
  dragActive: boolean;
  inspecting: boolean;

  fileInputRef:
    React.RefObject<HTMLInputElement | null>;

  onSelectFile: (
    file: File | null,
  ) => void;

  onRemoveFile: () => void;

  onDrop: (
    event: DragEvent<HTMLDivElement>,
  ) => void;

  onDragEnter: (
    event: DragEvent<HTMLDivElement>,
  ) => void;

  onDragLeave: (
    event: DragEvent<HTMLDivElement>,
  ) => void;

  onDragOver: (
    event: DragEvent<HTMLDivElement>,
  ) => void;

  onMetadata:
    React.Dispatch<
      React.SetStateAction<MetadataState>
    >;

  onAdvancedToggle: () => void;
  onContinue: () => void;
};

function UploadStep({
  file,
  inspection,
  metadata,
  advancedOpen,
  dragActive,
  inspecting,
  fileInputRef,
  onSelectFile,
  onRemoveFile,
  onDrop,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onMetadata,
  onAdvancedToggle,
  onContinue,
}: UploadStepProps) {
  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Panel title="Source file">
          {!file ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() =>
                fileInputRef.current?.click()
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" ||
                  event.key === " "
                ) {
                  fileInputRef.current?.click();
                }
              }}
              onDrop={onDrop}
              onDragEnter={onDragEnter}
              onDragLeave={onDragLeave}
              onDragOver={onDragOver}
              className={[
                "flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-6 text-center transition",
                dragActive
                  ? "border-[var(--gh-accent-fg)] bg-[var(--gh-accent-muted)]"
                  : "border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] hover:border-[var(--gh-accent-fg)]",
              ].join(" ")}
            >
              <div className="flex size-12 items-center justify-center rounded-full border border-[var(--gh-border-default)] bg-[var(--gh-canvas)]">
                <UploadCloud className="size-5 text-[var(--gh-fg-muted)]" />
              </div>

              <p className="mt-4 text-sm font-semibold">
                Drop a CSV file here
              </p>

              <p className="mt-1 text-xs text-[var(--gh-fg-muted)]">
                or click to browse
              </p>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs text-[var(--gh-fg-muted)]">
                <span className="gh-badge">
                  CSV
                </span>

                <span className="gh-badge">
                  UTF-8
                </span>

                <span>
                  Automatic inspection
                </span>
              </div>
            </div>
          ) : (
            <SelectedFile
              file={file}
              inspection={inspection}
              inspecting={inspecting}
              onRemove={onRemoveFile}
            />
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) =>
              onSelectFile(
                event.target.files?.[0] ??
                  null,
              )
            }
          />
        </Panel>

        {inspection ? (
          <PreviewPanel
            inspection={inspection}
          />
        ) : null}
      </div>

      <aside className="space-y-4">
        <Panel title="Dataset details">
          <div className="space-y-4">
            <Field label="Dataset name">
              <input
                value={metadata.name}
                onChange={(event) =>
                  onMetadata(
                    (current) => ({
                      ...current,
                      name:
                        event.target.value,
                    }),
                  )
                }
                className="gh-input h-9"
                placeholder="Dataset name"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Version">
                <input
                  value={metadata.version}
                  onChange={(event) =>
                    onMetadata(
                      (current) => ({
                        ...current,
                        version:
                          event.target.value,
                      }),
                    )
                  }
                  className="gh-input h-9"
                  placeholder="1.0.0"
                />
              </Field>

              <Field label="Task">
                <select
                  value={metadata.task}
                  onChange={(event) =>
                    onMetadata(
                      (current) => ({
                        ...current,
                        task:
                          event.target
                            .value as DatasetTask,
                      }),
                    )
                  }
                  className="gh-input h-9"
                >
                  <option value="hate_speech">
                    Hate speech
                  </option>

                  <option value="sentiment">
                    Sentiment
                  </option>
                </select>
              </Field>
            </div>

            <button
              type="button"
              onClick={
                onAdvancedToggle
              }
              className="flex w-full items-center justify-between border-t border-[var(--gh-border-muted)] pt-3 text-left text-sm font-medium"
            >
              Advanced metadata

              {advancedOpen ? (
                <ChevronUp className="size-4 text-[var(--gh-fg-muted)]" />
              ) : (
                <ChevronDown className="size-4 text-[var(--gh-fg-muted)]" />
              )}
            </button>

            {advancedOpen ? (
              <div className="space-y-4">
                <Field label="Description">
                  <textarea
                    value={
                      metadata.description
                    }
                    onChange={(event) =>
                      onMetadata(
                        (current) => ({
                          ...current,
                          description:
                            event.target
                              .value,
                        }),
                      )
                    }
                    className="gh-input min-h-20 resize-y py-2"
                    placeholder="Optional"
                  />
                </Field>

                <Field label="Source">
                  <input
                    value={
                      metadata.source_name
                    }
                    onChange={(event) =>
                      onMetadata(
                        (current) => ({
                          ...current,
                          source_name:
                            event.target
                              .value,
                        }),
                      )
                    }
                    className="gh-input h-9"
                    placeholder="Optional"
                  />
                </Field>

                <Field label="Source URL">
                  <input
                    value={
                      metadata.source_url
                    }
                    onChange={(event) =>
                      onMetadata(
                        (current) => ({
                          ...current,
                          source_url:
                            event.target
                              .value,
                        }),
                      )
                    }
                    className="gh-input h-9"
                    placeholder="Optional"
                  />
                </Field>

                <Field label="License">
                  <input
                    value={
                      metadata.license_name
                    }
                    onChange={(event) =>
                      onMetadata(
                        (current) => ({
                          ...current,
                          license_name:
                            event.target
                              .value,
                        }),
                      )
                    }
                    className="gh-input h-9"
                    placeholder="Optional"
                  />
                </Field>
              </div>
            ) : null}

            <button
              type="button"
              onClick={onContinue}
              disabled={
                !inspection ||
                inspecting ||
                !metadata.name.trim() ||
                !metadata.version.trim()
              }
              className="gh-button gh-button-primary w-full justify-center"
            >
              Continue
              <ArrowRight className="size-4" />
            </button>
          </div>
        </Panel>

        {inspection ? (
          <InspectionSummary
            inspection={inspection}
          />
        ) : (
          <div className="rounded-md border border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] p-3">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 size-4 shrink-0 text-[var(--gh-fg-muted)]" />

              <p className="text-xs leading-5 text-[var(--gh-fg-muted)]">
                The file will be
                inspected automatically
                after selection.
              </p>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function SelectedFile({
  file,
  inspection,
  inspecting,
  onRemove,
}: {
  file: File;

  inspection:
    | DatasetInspectionRead
    | null;

  inspecting: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-md border border-[var(--gh-border-default)]">
      <div className="flex items-center gap-3 border-b border-[var(--gh-border-muted)] p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)]">
          <FileSpreadsheet className="size-5 text-[var(--gh-fg-muted)]" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--gh-fg-default)]">
            {file.name}
          </p>

          <p className="mt-0.5 text-xs text-[var(--gh-fg-muted)]">
            {formatBytes(file.size)}
          </p>
        </div>

        <button
          type="button"
          onClick={onRemove}
          className="flex size-8 items-center justify-center rounded-md text-[var(--gh-fg-muted)] hover:bg-[var(--gh-danger-muted)] hover:text-[var(--gh-danger-fg)]"
          aria-label="Remove selected file"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="p-4">
        {inspecting ? (
          <StatusLine
            icon={
              <Loader2 className="size-4 animate-spin" />
            }
            title="Inspecting file"
            description="Detecting columns, encoding and sample rows."
          />
        ) : inspection ? (
          <StatusLine
            icon={
              <CheckCircle2 className="size-4 text-[var(--gh-success-fg)]" />
            }
            title="Ready for mapping"
            description={`${inspection.total_rows.toLocaleString()} rows detected.`}
          />
        ) : (
          <StatusLine
            icon={
              <Circle className="size-4 text-[var(--gh-fg-muted)]" />
            }
            title="Waiting"
            description="Inspection has not started."
          />
        )}
      </div>
    </div>
  );
}

function InspectionSummary({
  inspection,
}: {
  inspection: DatasetInspectionRead;
}) {
  return (
    <Panel title="Inspection">
      <dl className="space-y-3">
        <SummaryRow
          label="Rows"
          value={inspection.total_rows.toLocaleString()}
        />

        <SummaryRow
          label="Columns"
          value={inspection.total_columns.toLocaleString()}
        />

        <SummaryRow
          label="Encoding"
          value={inspection.encoding}
        />

        <SummaryRow
          label="Delimiter"
          value={formatDelimiter(
            inspection.delimiter,
          )}
        />

        <SummaryRow
          label="Text"
          value={
            inspection.suggested_text_column ??
            "Not detected"
          }
        />

        <SummaryRow
          label="Label"
          value={
            inspection
              .suggested_label_columns[0] ??
            "Not detected"
          }
        />
      </dl>
    </Panel>
  );
}

function PreviewPanel({
  inspection,
}: {
  inspection: DatasetInspectionRead;
}) {
  const columns =
    inspection.columns.slice(0, 5);

  return (
    <Panel
      title="Preview"
      description="First detected rows"
    >
      <div className="overflow-x-auto rounded-md border border-[var(--gh-border-default)]">
        <table className="w-full min-w-[620px] text-left text-xs">
          <thead className="bg-[var(--gh-canvas-subtle)]">
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  className="border-b border-[var(--gh-border-default)] px-3 py-2 font-medium text-[var(--gh-fg-default)]"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--gh-border-muted)]">
            {inspection.sample_rows
              .slice(0, 6)
              .map((row, index) => (
                <tr key={index}>
                  {columns.map(
                    (column) => (
                      <td
                        key={column}
                        className="max-w-64 truncate px-3 py-2 text-[var(--gh-fg-muted)]"
                      >
                        {String(
                          row[column] ?? "",
                        )}
                      </td>
                    ),
                  )}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

type MappingStepProps = {
  inspection: DatasetInspectionRead;

  textColumn: string;
  labelColumn: string;

  mappingRows: MappingRow[];

  dropEmptyText: boolean;
  dropEmptyLabel: boolean;
  dropDuplicates: boolean;

  excludeReplacementCharacters: boolean;

  validating: boolean;

  onTextColumn: (
    value: string,
  ) => void;

  onLabelColumn: (
    value: string,
  ) => void;

  onMappingChange: (
    id: string,
    field: "source" | "target",
    value: string,
  ) => void;

  onMappingAdd: () => void;

  onMappingRemove: (
    id: string,
  ) => void;

  onDropEmptyText: (
    value: boolean,
  ) => void;

  onDropEmptyLabel: (
    value: boolean,
  ) => void;

  onDropDuplicates: (
    value: boolean,
  ) => void;

  onExcludeReplacementCharacters: (
    value: boolean,
  ) => void;

  onBack: () => void;
  onValidate: () => void;
};

function MappingStep({
  inspection,
  textColumn,
  labelColumn,
  mappingRows,
  dropEmptyText,
  dropEmptyLabel,
  dropDuplicates,
  excludeReplacementCharacters,
  validating,
  onTextColumn,
  onLabelColumn,
  onMappingChange,
  onMappingAdd,
  onMappingRemove,
  onDropEmptyText,
  onDropEmptyLabel,
  onDropDuplicates,
  onExcludeReplacementCharacters,
  onBack,
  onValidate,
}: MappingStepProps) {
  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Panel
          title="Column mapping"
          description="Choose the fields used for training."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <ColumnChoice
              title="Text column"
              value={textColumn}
              columns={inspection.columns}
              onChange={onTextColumn}
            />

            <ColumnChoice
              title="Label column"
              value={labelColumn}
              columns={inspection.columns}
              onChange={onLabelColumn}
            />
          </div>
        </Panel>

        <Panel
          title="Label mapping"
          description="Convert source labels into training classes."
          action={
            <button
              type="button"
              onClick={onMappingAdd}
              className="gh-button"
            >
              <Plus className="size-4" />
              Add
            </button>
          }
        >
          <div className="space-y-2">
            <div className="hidden grid-cols-[minmax(0,1fr)_32px_minmax(0,1fr)_36px] gap-2 px-1 text-xs text-[var(--gh-fg-muted)] sm:grid">
              <span>Source value</span>
              <span />
              <span>Training label</span>
              <span />
            </div>

            {mappingRows.map((row) => (
              <div
                key={row.id}
                className="grid grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)_36px] items-center gap-2"
              >
                <input
                  value={row.source}
                  onChange={(event) =>
                    onMappingChange(
                      row.id,
                      "source",
                      event.target.value,
                    )
                  }
                  className="gh-input h-9"
                  placeholder="Source value"
                />

                <ArrowRight className="size-4 text-[var(--gh-fg-muted)]" />

                <input
                  value={row.target}
                  onChange={(event) =>
                    onMappingChange(
                      row.id,
                      "target",
                      event.target.value,
                    )
                  }
                  className="gh-input h-9"
                  placeholder="Training label"
                />

                <button
                  type="button"
                  onClick={() =>
                    onMappingRemove(row.id)
                  }
                  className="flex size-8 items-center justify-center rounded-md text-[var(--gh-fg-muted)] hover:bg-[var(--gh-danger-muted)] hover:text-[var(--gh-danger-fg)]"
                  aria-label="Remove mapping"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </Panel>

        <PreviewPanel
          inspection={inspection}
        />
      </div>

      <aside className="space-y-4">
        <Panel title="Cleaning rules">
          <div className="divide-y divide-[var(--gh-border-muted)]">
            <ToggleRow
              label="Empty text"
              description="Remove rows without usable text."
              checked={dropEmptyText}
              onChange={
                onDropEmptyText
              }
            />

            <ToggleRow
              label="Empty labels"
              description="Remove rows without labels."
              checked={dropEmptyLabel}
              onChange={
                onDropEmptyLabel
              }
            />

            <ToggleRow
              label="Duplicates"
              description="Keep one copy of duplicate text."
              checked={dropDuplicates}
              onChange={
                onDropDuplicates
              }
            />

            <ToggleRow
              label="Invalid Unicode"
              description="Remove replacement-character rows."
              checked={
                excludeReplacementCharacters
              }
              onChange={
                onExcludeReplacementCharacters
              }
            />
          </div>
        </Panel>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBack}
            className="gh-button"
          >
            Back
          </button>

          <button
            type="button"
            onClick={onValidate}
            disabled={validating}
            className="gh-button gh-button-primary flex-1 justify-center"
          >
            {validating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}

            Validate
          </button>
        </div>
      </aside>
    </div>
  );
}

function ColumnChoice({
  title,
  value,
  columns,
  onChange,
}: {
  title: string;
  value: string;
  columns: string[];
  onChange: (
    value: string,
  ) => void;
}) {
  return (
    <label className="rounded-md border border-[var(--gh-border-default)] p-3">
      <span className="text-xs font-medium text-[var(--gh-fg-muted)]">
        {title}
      </span>

      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="gh-input mt-2 h-9"
      >
        <option value="">
          Select column
        </option>

        {columns.map((column) => (
          <option
            key={column}
            value={column}
          >
            {column}
          </option>
        ))}
      </select>

      {value ? (
        <p className="mt-2 truncate text-xs text-[var(--gh-accent-fg)]">
          Mapped to {value}
        </p>
      ) : null}
    </label>
  );
}

type ValidationStepProps = {
  validation:
    DatasetMappingValidationResponse;

  metadata: MetadataState;
  registering: boolean;

  onMetadata:
    React.Dispatch<
      React.SetStateAction<MetadataState>
    >;

  onBack: () => void;
  onRegister: () => void;
};

function ValidationStep({
  validation,
  metadata,
  registering,
  onMetadata,
  onBack,
  onRegister,
}: ValidationStepProps) {
  const checks = [
    {
      label: "Text values",
      detail: `${validation.empty_text_rows.toLocaleString()} empty rows`,
      passed:
        validation.empty_text_rows ===
          0 ||
        validation
          .validation_configuration
          .drop_empty_text,
    },
    {
      label: "Label values",
      detail: `${validation.empty_label_rows.toLocaleString()} empty rows`,
      passed:
        validation.empty_label_rows ===
          0 ||
        validation
          .validation_configuration
          .drop_empty_label,
    },
    {
      label: "Label mapping",
      detail: `${validation.unmapped_label_rows.toLocaleString()} unmapped rows`,
      passed:
        validation.unmapped_label_rows ===
        0,
    },
    {
      label: "Duplicate text",
      detail: `${validation.duplicate_text_rows.toLocaleString()} detected`,
      passed:
        validation.duplicate_text_rows ===
          0 ||
        validation
          .validation_configuration
          .drop_duplicates,
    },
    {
      label: "Unicode integrity",
      detail: `${validation.replacement_character_rows.toLocaleString()} affected rows`,
      passed:
        validation.replacement_character_rows ===
          0 ||
        validation
          .validation_configuration
          .exclude_replacement_character_rows,
    },
  ];

  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <Panel
          title={
            validation.can_register
              ? "All required checks passed"
              : "Validation needs attention"
          }
          description={`${validation.valid_rows.toLocaleString()} valid rows from ${validation.total_rows.toLocaleString()} total.`}
        >
          <div className="divide-y divide-[var(--gh-border-muted)]">
            {checks.map((check) => (
              <ValidationCheck
                key={check.label}
                label={check.label}
                detail={check.detail}
                passed={check.passed}
              />
            ))}
          </div>
        </Panel>

        <section className="grid overflow-hidden rounded-md border border-[var(--gh-border-default)] sm:grid-cols-4">
          <Metric
            label="Total"
            value={validation.total_rows}
          />

          <Metric
            label="Valid"
            value={validation.valid_rows}
            success
          />

          <Metric
            label="Invalid"
            value={validation.invalid_rows}
          />

          <Metric
            label="Labels"
            value={
              Object.keys(
                validation.mapped_label_distribution,
              ).length
            }
          />
        </section>

        {validation.warnings.length >
        0 ? (
          <div className="rounded-md border border-[var(--gh-attention-fg)] bg-[var(--gh-attention-muted)] p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />

              <div>
                <p className="text-sm font-medium">
                  Warnings
                </p>

                <ul className="mt-1 space-y-1 text-xs leading-5">
                  {validation.warnings.map(
                    (warning) => (
                      <li key={warning}>
                        {warning}
                      </li>
                    ),
                  )}
                </ul>
              </div>
            </div>
          </div>
        ) : null}

        <ValidatedPreview
          validation={validation}
        />
      </div>

      <aside className="space-y-4">
        <Panel
          title="Ready to register"
          description="Confirm the final dataset metadata."
        >
          <div className="space-y-4">
            <Field label="Dataset name">
              <input
                value={metadata.name}
                onChange={(event) =>
                  onMetadata(
                    (current) => ({
                      ...current,
                      name:
                        event.target.value,
                    }),
                  )
                }
                className="gh-input h-9"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Version">
                <input
                  value={metadata.version}
                  onChange={(event) =>
                    onMetadata(
                      (current) => ({
                        ...current,
                        version:
                          event.target.value,
                      }),
                    )
                  }
                  className="gh-input h-9"
                />
              </Field>

              <Field label="Task">
                <select
                  value={metadata.task}
                  onChange={(event) =>
                    onMetadata(
                      (current) => ({
                        ...current,
                        task:
                          event.target
                            .value as DatasetTask,
                      }),
                    )
                  }
                  className="gh-input h-9"
                >
                  <option value="hate_speech">
                    Hate speech
                  </option>

                  <option value="sentiment">
                    Sentiment
                  </option>
                </select>
              </Field>
            </div>

            <dl className="divide-y divide-[var(--gh-border-muted)] rounded-md border border-[var(--gh-border-default)]">
              <CompactDetail
                label="Rows"
                value={validation.valid_rows.toLocaleString()}
              />

              <CompactDetail
                label="Text column"
                value={
                  validation.text_column
                }
              />

              <CompactDetail
                label="Label column"
                value={
                  validation.label_column
                }
              />

              <CompactDetail
                label="Status"
                value={
                  validation.can_register
                    ? "Ready"
                    : "Blocked"
                }
                success={
                  validation.can_register
                }
              />
            </dl>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onBack}
                className="gh-button"
              >
                Back
              </button>

              <button
                type="button"
                onClick={onRegister}
                disabled={
                  !validation.can_register ||
                  registering
                }
                className="gh-button gh-button-primary flex-1 justify-center"
              >
                {registering ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Database className="size-4" />
                )}

                Register
              </button>
            </div>
          </div>
        </Panel>
      </aside>
    </div>
  );
}

function ValidationCheck({
  label,
  detail,
  passed,
}: {
  label: string;
  detail: string;
  passed: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <div
        className={[
          "flex size-6 shrink-0 items-center justify-center rounded-full border",
          passed
            ? "border-[var(--gh-success-fg)] text-[var(--gh-success-fg)]"
            : "border-[var(--gh-danger-fg)] text-[var(--gh-danger-fg)]",
        ].join(" ")}
      >
        {passed ? (
          <Check className="size-3.5" />
        ) : (
          <X className="size-3.5" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--gh-fg-default)]">
          {label}
        </p>

        <p className="mt-0.5 text-xs text-[var(--gh-fg-muted)]">
          {detail}
        </p>
      </div>

      <span
        className={[
          "text-xs font-medium",
          passed
            ? "text-[var(--gh-success-fg)]"
            : "text-[var(--gh-danger-fg)]",
        ].join(" ")}
      >
        {passed ? "Passed" : "Failed"}
      </span>
    </div>
  );
}

function ValidatedPreview({
  validation,
}: {
  validation:
    DatasetMappingValidationResponse;
}) {
  return (
    <Panel
      title="Validated preview"
      description="Mapped training records"
    >
      <div className="overflow-x-auto rounded-md border border-[var(--gh-border-default)]">
        <table className="w-full min-w-[700px] text-left text-xs">
          <thead className="bg-[var(--gh-canvas-subtle)]">
            <tr>
              <th className="border-b border-[var(--gh-border-default)] px-3 py-2 font-medium">
                Row
              </th>

              <th className="border-b border-[var(--gh-border-default)] px-3 py-2 font-medium">
                Text
              </th>

              <th className="border-b border-[var(--gh-border-default)] px-3 py-2 font-medium">
                Source
              </th>

              <th className="border-b border-[var(--gh-border-default)] px-3 py-2 font-medium">
                Label
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--gh-border-muted)]">
            {validation.preview_rows
              .slice(0, 10)
              .map((row) => (
                <tr
                  key={
                    row.source_row_number
                  }
                >
                  <td className="px-3 py-2 text-[var(--gh-fg-muted)]">
                    {
                      row.source_row_number
                    }
                  </td>

                  <td className="max-w-lg truncate px-3 py-2">
                    {row.text}
                  </td>

                  <td className="px-3 py-2 text-[var(--gh-fg-muted)]">
                    {row.source_label}
                  </td>

                  <td className="px-3 py-2 font-medium">
                    {row.label}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function CompleteStep({
  dataset,
  onRestart,
}: {
  dataset: DatasetVersionRead;
  onRestart: () => void;
}) {
  return (
    <section className="mt-4 flex min-h-[480px] items-center justify-center rounded-md border border-[var(--gh-border-default)] bg-[var(--gh-canvas)]">
      <div className="w-full max-w-lg px-6 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-[var(--gh-success-fg)] text-[var(--gh-success-fg)]">
          <CheckCircle2 className="size-7" />
        </div>

        <h2 className="mt-5 text-xl font-semibold text-[var(--gh-fg-default)]">
          Dataset registered
        </h2>

        <p className="mt-2 text-sm text-[var(--gh-fg-muted)]">
          The dataset is now available
          in the BanglaGuard registry.
        </p>

        <dl className="mx-auto mt-6 divide-y divide-[var(--gh-border-muted)] rounded-md border border-[var(--gh-border-default)] text-left">
          <CompactDetail
            label="Dataset"
            value={dataset.name}
          />

          <CompactDetail
            label="Version"
            value={dataset.version}
          />

          <CompactDetail
            label="Task"
            value={formatTask(
              dataset.task,
            )}
          />

          <CompactDetail
            label="Rows"
            value={dataset.total_samples.toLocaleString()}
          />

          <CompactDetail
            label="Status"
            value="Registered"
            success
          />
        </dl>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={onRestart}
            className="gh-button"
          >
            Upload another
          </button>

          <Link
            href="/datasets"
            className="gh-button gh-button-primary"
          >
            Open registry
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function StepNavigation({
  currentIndex,
}: {
  currentIndex: number;
}) {
  return (
    <nav
      className="mt-4 overflow-hidden rounded-md border border-[var(--gh-border-default)] bg-[var(--gh-canvas)]"
      aria-label="Dataset upload progress"
    >
      <div className="grid grid-cols-4">
        {STEPS.map((item, index) => {
          const complete =
            index < currentIndex;

          const active =
            index === currentIndex;

          return (
            <div
              key={item.key}
              className={[
                "flex min-h-11 items-center gap-2 border-r border-[var(--gh-border-default)] px-3 last:border-r-0",
                active
                  ? "bg-[var(--gh-accent-muted)]"
                  : "",
              ].join(" ")}
            >
              <span
                className={[
                  "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                  complete
                    ? "border-[var(--gh-success-fg)] text-[var(--gh-success-fg)]"
                    : active
                      ? "border-[var(--gh-accent-fg)] text-[var(--gh-accent-fg)]"
                      : "border-[var(--gh-border-default)] text-[var(--gh-fg-muted)]",
                ].join(" ")}
              >
                {complete ? (
                  <Check className="size-3" />
                ) : (
                  index + 1
                )}
              </span>

              <span
                className={[
                  "truncate text-xs font-medium sm:text-sm",
                  active
                    ? "text-[var(--gh-accent-fg)]"
                    : "text-[var(--gh-fg-muted)]",
                ].join(" ")}
              >
                {item.title}
              </span>
            </div>
          );
        })}
      </div>
    </nav>
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
    <section className="overflow-hidden rounded-md border border-[var(--gh-border-default)] bg-[var(--gh-canvas)]">
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--gh-border-default)] px-4 py-2">
        <div>
          <h2 className="text-sm font-semibold text-[var(--gh-fg-default)]">
            {title}
          </h2>

          {description ? (
            <p className="mt-0.5 text-xs text-[var(--gh-fg-muted)]">
              {description}
            </p>
          ) : null}
        </div>

        {action}
      </header>

      <div className="p-4">
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-[var(--gh-fg-default)]">
        {label}
      </span>

      {children}
    </label>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (
    value: boolean,
  ) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-3 first:pt-0 last:pb-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) =>
          onChange(
            event.target.checked,
          )
        }
        className="mt-0.5 size-4"
      />

      <span>
        <span className="block text-sm font-medium text-[var(--gh-fg-default)]">
          {label}
        </span>

        <span className="mt-0.5 block text-xs leading-5 text-[var(--gh-fg-muted)]">
          {description}
        </span>
      </span>
    </label>
  );
}

function StatusLine({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5">
        {icon}
      </div>

      <div>
        <p className="text-sm font-medium text-[var(--gh-fg-default)]">
          {title}
        </p>

        <p className="mt-0.5 text-xs text-[var(--gh-fg-muted)]">
          {description}
        </p>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <dt className="text-[var(--gh-fg-muted)]">
        {label}
      </dt>

      <dd className="max-w-48 break-words text-right font-medium text-[var(--gh-fg-default)]">
        {value}
      </dd>
    </div>
  );
}

function Metric({
  label,
  value,
  success = false,
}: {
  label: string;
  value: number;
  success?: boolean;
}) {
  return (
    <div className="border-b border-r border-[var(--gh-border-default)] p-4 last:border-r-0 sm:border-b-0">
      <p className="text-xs text-[var(--gh-fg-muted)]">
        {label}
      </p>

      <p
        className={[
          "mt-1 text-xl font-semibold",
          success
            ? "text-[var(--gh-success-fg)]"
            : "text-[var(--gh-fg-default)]",
        ].join(" ")}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function CompactDetail({
  label,
  value,
  success = false,
}: {
  label: string;
  value: string;
  success?: boolean;
}) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 px-3 py-2.5">
      <dt className="text-xs text-[var(--gh-fg-muted)]">
        {label}
      </dt>

      <dd
        className={[
          "min-w-0 break-words text-sm font-medium text-[var(--gh-fg-default)]",
          success
            ? "text-[var(--gh-success-fg)]"
            : "",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

function getErrorMessage(
  error: unknown,
): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error
  ) {
    const response = (
      error as {
        response?: {
          data?: {
            detail?:
              | string
              | Array<{
                  msg?: string;
                }>;
          };
        };
      }
    ).response;

    const detail =
      response?.data?.detail;

    if (typeof detail === "string") {
      return detail;
    }

    if (Array.isArray(detail)) {
      return detail
        .map((item) => item.msg)
        .filter(Boolean)
        .join(", ");
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "The request could not be completed.";
}

function formatBytes(
  value: number,
): string {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(
      value / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    value /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}

function formatDelimiter(
  value: string,
): string {
  if (value === ",") {
    return "Comma";
  }

  if (value === "\t") {
    return "Tab";
  }

  if (value === ";") {
    return "Semicolon";
  }

  return value;
}

function formatTask(
  value: string,
): string {
  if (value === "hate_speech") {
    return "Hate speech";
  }

  if (value === "sentiment") {
    return "Sentiment";
  }

  return value.replaceAll("_", " ");
}

export function DatasetUploadWorkspace() {
  const [mode, setMode] = useState("single");
  return <div className="bg-background"><nav aria-label="Dataset import method" className="flex flex-wrap gap-2 border-b border-border px-5 py-3">{[["single", "Single CSV · create new splits"], ["splits", "Existing train / validation / test splits"]].map(([id,label]) => <button type="button" key={id} aria-pressed={mode === id} onClick={() => setMode(id)} className={`gh-button ${mode === id ? "gh-button-primary" : ""}`}>{label}</button>)}</nav><div hidden={mode !== "single"}><SingleDatasetUploadWorkspace /></div><div hidden={mode !== "splits"}><SplitImport /></div></div>;
}

"use client";

import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  MessageSquareText,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
  useMemo,
  useState,
} from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getApiErrorMessage,
} from "@/lib/api";
import {
  listFeedbackForReview,
  reviewFeedback,
} from "@/lib/feedback";
import { cn } from "@/lib/utils";

import type {
  FeedbackReviewItem,
  FeedbackStatus,
} from "@/types/feedback";

type ReviewQueueFilter =
  | "all"
  | FeedbackStatus;

function formatWords(
  value?: string | null,
): string {
  if (!value) {
    return "—";
  }

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function formatPercentage(
  value: number,
): string {
  const normalized =
    value <= 1
      ? value * 100
      : value;

  return `${normalized.toFixed(1)}%`;
}

function formatDateTime(
  value: string,
): string {
  const parsed = new Date(value);

  if (
    Number.isNaN(parsed.getTime())
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(parsed);
}

function getStatusClass(
  status: FeedbackStatus,
): string {
  if (status === "pending") {
    return (
      "border-amber-300 bg-amber-50 " +
      "text-amber-700 dark:bg-amber-950/30 " +
      "dark:text-amber-300"
    );
  }

  if (status === "reviewed") {
    return (
      "border-emerald-300 bg-emerald-50 " +
      "text-emerald-700 dark:bg-emerald-950/30 " +
      "dark:text-emerald-300"
    );
  }

  return (
    "border-red-300 bg-red-50 " +
    "text-red-700 dark:bg-red-950/30 " +
    "dark:text-red-300"
  );
}

export function FeedbackReviewQueue() {
  const queryClient =
    useQueryClient();

  const [statusFilter, setStatusFilter] =
    useState<ReviewQueueFilter>(
      "pending",
    );

  const [searchValue, setSearchValue] =
    useState("");

  const [
    selectedFeedbackId,
    setSelectedFeedbackId,
  ] = useState<string | null>(null);

  const [reviewerNote, setReviewerNote] =
    useState("");

  const reviewQuery = useQuery({
    queryKey: [
      "feedback-review-queue",
    ],
    queryFn: () =>
      listFeedbackForReview(
        null,
        100,
        0,
      ),
  });

  const items = useMemo(
    () => reviewQuery.data ?? [],
    [reviewQuery.data],
  );

  const selectedItem =
    items.find(
      (item) =>
        item.id ===
        selectedFeedbackId,
    ) ?? null;

  const filteredItems =
    useMemo(() => {
      const search =
        searchValue
          .trim()
          .toLowerCase();

      return items.filter(
        (item) => {
          const matchesStatus =
            statusFilter === "all" ||
            item.status ===
              statusFilter;

          if (!matchesStatus) {
            return false;
          }

          if (!search) {
            return true;
          }

          const predictionText =
            (
              item.prediction_text ??
              item.normalized_text ??
              ""
            ).toLowerCase();

          return (
            predictionText.includes(
              search,
            ) ||
            item.id
              .toLowerCase()
              .includes(search) ||
            item.prediction_id
              .toLowerCase()
              .includes(search) ||
            item.model_name
              .toLowerCase()
              .includes(search) ||
            item.predicted_label
              .toLowerCase()
              .includes(search) ||
            item.verdict
              .toLowerCase()
              .includes(search)
          );
        },
      );
    }, [
      items,
      searchValue,
      statusFilter,
    ]);

  const reviewMutation = useMutation({
    mutationFn: ({
      feedbackId,
      status,
      reviewerNoteValue,
    }: {
      feedbackId: string;
      status:
        | "reviewed"
        | "rejected";
      reviewerNoteValue:
        string | null;
    }) =>
      reviewFeedback(
        feedbackId,
        {
          status,
          reviewer_note:
            reviewerNoteValue,
        },
      ),

    onSuccess: async (
      updatedFeedback,
    ) => {
      toast.success(
        updatedFeedback.status ===
          "reviewed"
          ? "Feedback approved."
          : "Feedback rejected.",
      );

      setSelectedFeedbackId(
        null,
      );
      setReviewerNote("");

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [
            "feedback-review-queue",
          ],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            "my-feedback",
          ],
        }),
      ]);
    },

    onError: (error) => {
      toast.error(
        getApiErrorMessage(
          error,
          "Unable to review feedback.",
        ),
      );
    },
  });

  function openReview(
    item: FeedbackReviewItem,
  ) {
    setSelectedFeedbackId(
      item.id,
    );

    setReviewerNote(
      item.reviewer_note ?? "",
    );
  }

  function submitReview(
    status:
      | "reviewed"
      | "rejected",
  ) {
    if (!selectedItem) {
      return;
    }

    const trimmedNote =
      reviewerNote.trim();

    if (
      status === "rejected" &&
      !trimmedNote
    ) {
      toast.error(
        "Add a reviewer note before rejecting feedback.",
      );

      return;
    }

    reviewMutation.mutate({
      feedbackId:
        selectedItem.id,
      status,
      reviewerNoteValue:
        trimmedNote || null,
    });
  }

  const pendingCount =
    items.filter(
      (item) =>
        item.status === "pending",
    ).length;

  const reviewedCount =
    items.filter(
      (item) =>
        item.status === "reviewed",
    ).length;

  const rejectedCount =
    items.filter(
      (item) =>
        item.status === "rejected",
    ).length;

  if (reviewQuery.isLoading) {
    return (
      <section className="h-96 animate-pulse rounded-xl border bg-muted/30" />
    );
  }

  if (reviewQuery.error) {
    return (
      <section className="gh-panel p-6">
        <AlertCircle className="size-8 text-red-600" />

        <h2 className="mt-4 text-xl font-semibold">
          Review queue could not load
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">
          {getApiErrorMessage(
            reviewQuery.error,
            "Unable to load submitted feedback.",
          )}
        </p>

        <Button
          className="mt-5"
          onClick={() => {
            void reviewQuery.refetch();
          }}
        >
          Try again
        </Button>
      </section>
    );
  }

  return (
    <>
      <section className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <ReviewStatCard
            label="Pending review"
            value={pendingCount}
            icon={MessageSquareText}
          />

          <ReviewStatCard
            label="Reviewed"
            value={reviewedCount}
            icon={CheckCircle2}
          />

          <ReviewStatCard
            label="Rejected"
            value={rejectedCount}
            icon={XCircle}
          />
        </div>

        <section className="gh-panel p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
              <ShieldCheck className="size-5" />
            </div>

            <div>
              <h2 className="font-semibold">
                Research review controls
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Search and filter
                feedback submitted for
                researcher validation.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-[1fr_220px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

              <input
                value={searchValue}
                onChange={(event) =>
                  setSearchValue(
                    event.target.value,
                  )
                }
                placeholder="Search prediction text, feedback ID, label, or model..."
                className="gh-input w-full !pl-10"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target
                    .value as ReviewQueueFilter,
                )
              }
              className="gh-input min-w-0"
            >
              <option value="all">
                All statuses
              </option>

              <option value="pending">
                Pending
              </option>

              <option value="reviewed">
                Reviewed
              </option>

              <option value="rejected">
                Rejected
              </option>
            </select>
          </div>
        </section>

        <section className="overflow-hidden gh-panel">
          <div className="flex items-center justify-between gap-4 p-4">
            <div>
              <h2 className="font-semibold">
                Submitted feedback
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Showing{" "}
                {filteredItems.length}{" "}
                review records.
              </p>
            </div>

            <Badge variant="outline">
              Researcher access
            </Badge>
          </div>

          {filteredItems.length > 0 ? (
            <div className="overflow-x-auto border-t">
              <table className="gh-table w-full min-w-[1100px] text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">
                      Prediction
                    </th>

                    <th className="px-4 py-3 font-medium">
                      Model output
                    </th>

                    <th className="px-4 py-3 font-medium">
                      User verdict
                    </th>

                    <th className="px-4 py-3 font-medium">
                      Correction
                    </th>

                    <th className="px-4 py-3 font-medium">
                      Submitted
                    </th>

                    <th className="px-4 py-3 font-medium">
                      Status
                    </th>

                    <th className="px-4 py-3 font-medium">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredItems.map(
                    (item) => (
                      <tr
                        key={item.id}
                        className="border-t align-top"
                      >
                        <td className="max-w-sm px-4 py-3">
                          <p className="line-clamp-2 font-medium">
                            {item.prediction_text ??
                              item.normalized_text ??
                              "Prediction text unavailable"}
                          </p>

                          <p className="mt-2 text-xs text-muted-foreground">
                            {formatWords(
                              item.task,
                            )}
                          </p>
                        </td>

                        <td className="px-4 py-3">
                          <Badge variant="secondary">
                            {formatWords(
                              item.predicted_label,
                            )}
                          </Badge>

                          <p className="mt-2 font-semibold">
                            {formatPercentage(
                              item.confidence,
                            )}
                          </p>

                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.model_name}{" "}
                            v{item.model_version}
                          </p>
                        </td>

                        <td className="px-4 py-3">
                          <p className="font-semibold">
                            {formatWords(
                              item.verdict,
                            )}
                          </p>

                          <p className="mt-2 max-w-xs text-xs text-muted-foreground">
                            {item.comment ??
                              "No comment provided."}
                          </p>
                        </td>

                        <td className="px-4 py-3">
                          {item.corrected_label
                            ? formatWords(
                                item.corrected_label,
                              )
                            : "—"}
                        </td>

                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {formatDateTime(
                            item.created_at,
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <Badge
                            variant="outline"
                            className={cn(
                              getStatusClass(
                                item.status,
                              ),
                            )}
                          >
                            {formatWords(
                              item.status,
                            )}
                          </Badge>
                        </td>

                        <td className="px-4 py-3">
                          <Button
                            size="sm"
                            variant={
                              item.status ===
                              "pending"
                                ? "default"
                                : "outline"
                            }
                            onClick={() =>
                              openReview(
                                item,
                              )
                            }
                          >
                            {item.status ===
                            "pending"
                              ? "Review"
                              : "View"}
                          </Button>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border-t p-8 text-center">
              <ClipboardCheck className="mx-auto size-9 text-muted-foreground" />

              <h3 className="mt-4 font-semibold">
                No feedback found
              </h3>

              <p className="mt-2 text-sm text-muted-foreground">
                There are no feedback
                records matching the
                selected status and
                search.
              </p>
            </div>
          )}
        </section>
      </section>

      <FeedbackReviewPanel
        item={selectedItem}
        reviewerNote={reviewerNote}
        isSubmitting={
          reviewMutation.isPending
        }
        onReviewerNoteChange={
          setReviewerNote
        }
        onApprove={() =>
          submitReview("reviewed")
        }
        onReject={() =>
          submitReview("rejected")
        }
        onClose={() => {
          setSelectedFeedbackId(
            null,
          );
          setReviewerNote("");
        }}
      />
    </>
  );
}

function FeedbackReviewPanel({
  item,
  reviewerNote,
  isSubmitting,
  onReviewerNoteChange,
  onApprove,
  onReject,
  onClose,
}: {
  item: FeedbackReviewItem | null;
  reviewerNote: string;
  isSubmitting: boolean;
  onReviewerNoteChange: (
    value: string,
  ) => void;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
}) {
  if (!item) {
    return null;
  }

  const canReview =
    item.status === "pending";

  return (
    <>
      <button
        type="button"
        aria-label="Close researcher review"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40"
      />

      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto border-l bg-background shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 p-5 backdrop-blur">
          <div>
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Research validation
            </p>

            <h2 className="mt-1 text-xl font-semibold">
              Review submitted feedback
            </h2>
          </div>

          <Button
            size="icon"
            variant="outline"
            onClick={onClose}
          >
            <XCircle className="size-4" />
          </Button>
        </div>

        <div className="space-y-5 p-4">
          <section className="rounded-lg border p-5">
            <p className="text-xs text-muted-foreground">
              Original Bangla text
            </p>

            <p className="mt-3 text-lg leading-8">
              {item.prediction_text ??
                item.normalized_text ??
                "Prediction text unavailable"}
            </p>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <DetailCard
              label="Predicted label"
              value={formatWords(
                item.predicted_label,
              )}
            />

            <DetailCard
              label="Confidence"
              value={formatPercentage(
                item.confidence,
              )}
            />

            <DetailCard
              label="User verdict"
              value={formatWords(
                item.verdict,
              )}
            />

            <DetailCard
              label="Current status"
              value={formatWords(
                item.status,
              )}
            />
          </section>

          <section className="rounded-lg border p-5">
            <h3 className="font-semibold">
              Submitted evidence
            </h3>

            <dl className="mt-4 space-y-4">
              <DetailRow
                label="Corrected label"
                value={
                  item.corrected_label
                    ? formatWords(
                        item.corrected_label,
                      )
                    : "—"
                }
              />

              <DetailRow
                label="User comment"
                value={
                  item.comment ??
                  "No comment provided."
                }
              />

              <DetailRow
                label="Model"
                value={`${item.model_name} v${item.model_version}`}
              />
            </dl>
          </section>

          <section className="rounded-lg border p-5">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="reviewer-note"
                className="font-semibold"
              >
                Reviewer note
              </label>

              <span className="text-xs text-muted-foreground">
                {reviewerNote.length}
                /2000
              </span>
            </div>

            <textarea
              id="reviewer-note"
              value={reviewerNote}
              disabled={
                !canReview ||
                isSubmitting
              }
              maxLength={2000}
              rows={6}
              onChange={(event) =>
                onReviewerNoteChange(
                  event.target.value,
                )
              }
              placeholder="Add a validation note, decision reason, or research observation..."
              className="mt-3 w-full resize-y rounded-xl border bg-background p-3 text-sm disabled:opacity-70"
            />

            {!canReview && (
              <p className="mt-3 text-sm text-muted-foreground">
                This feedback has
                already been{" "}
                {item.status}.
              </p>
            )}
          </section>

          {canReview && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                type="button"
                disabled={isSubmitting}
                onClick={onApprove}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 size-4" />
                )}

                Approve feedback
              </Button>

              <Button
                type="button"
                variant="destructive"
                disabled={isSubmitting}
                onClick={onReject}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <XCircle className="mr-2 size-4" />
                )}

                Reject feedback
              </Button>
            </div>
          )}

          {!canReview && (
            <section className="rounded-lg border bg-muted/30 p-5">
              <DetailRow
                label="Reviewer note"
                value={
                  item.reviewer_note ??
                  "No reviewer note."
                }
              />

              <div className="mt-4">
                <DetailRow
                  label="Reviewed at"
                  value={
                    item.reviewed_at
                      ? formatDateTime(
                          item.reviewed_at,
                        )
                      : "—"
                  }
                />
              </div>
            </section>
          )}
        </div>
      </aside>
    </>
  );
}

function ReviewStatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof ShieldCheck;
}) {
  return (
    <article className="gh-panel p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {label}
          </p>

          <p className="mt-2 text-2xl font-semibold">
            {value}
          </p>
        </div>

        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
          <Icon className="size-5" />
        </div>
      </div>
    </article>
  );
}

function DetailCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">
        {label}
      </p>

      <p className="mt-2 font-semibold">
        {value}
      </p>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">
        {label}
      </dt>

      <dd className="mt-1 whitespace-pre-wrap text-sm font-medium">
        {value}
      </dd>
    </div>
  );
}

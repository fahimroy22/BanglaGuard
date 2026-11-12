"use client";

import {
  AlertCircle,
  ArrowUpRight,
  BrainCircuit,
  CircleAlert,
  Filter,
  Gauge,
  Layers3,
  MessageSquareWarning,
  Search,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import {
  useMemo,
  useState,
} from "react";
import {
  useQuery,
} from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getApiErrorMessage,
} from "@/lib/api";
import {
  listActiveLearningCandidates,
} from "@/lib/feedback";
import { cn } from "@/lib/utils";

import type {
  ActiveLearningItem,
  ActiveLearningPriority,
} from "@/types/feedback";

type TaskFilter =
  | "all"
  | "hate_speech"
  | "sentiment";

type PriorityFilter =
  | "all"
  | ActiveLearningPriority;

type ReasonFilter =
  | "all"
  | string;

type SortOption =
  | "priority"
  | "lowest_confidence"
  | "newest";

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
  value: number | null | undefined,
): string {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  const normalized =
    value <= 1
      ? value * 100
      : value;

  return `${normalized.toFixed(1)}%`;
}

function formatScore(
  value: number,
): string {
  return value.toFixed(1);
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

function getPredictionText(
  item: ActiveLearningItem,
): string {
  return (
    item.prediction_text ??
    item.normalized_text ??
    "Prediction text unavailable"
  );
}

function getPriorityClass(
  priority: ActiveLearningPriority,
): string {
  if (priority === "high") {
    return (
      "border-red-300 bg-red-50 " +
      "text-red-700 dark:bg-red-950/30 " +
      "dark:text-red-300"
    );
  }

  if (priority === "medium") {
    return (
      "border-amber-300 bg-amber-50 " +
      "text-amber-700 dark:bg-amber-950/30 " +
      "dark:text-amber-300"
    );
  }

  return (
    "border-sky-300 bg-sky-50 " +
    "text-sky-700 dark:bg-sky-950/30 " +
    "dark:text-sky-300"
  );
}

export function ActiveLearningQueue() {
  const [searchValue, setSearchValue] =
    useState("");

  const [taskFilter, setTaskFilter] =
    useState<TaskFilter>("all");

  const [
    priorityFilter,
    setPriorityFilter,
  ] = useState<PriorityFilter>("all");

  const [
    reasonFilter,
    setReasonFilter,
  ] = useState<ReasonFilter>("all");

  const [sortOption, setSortOption] =
    useState<SortOption>("priority");

  const [
    selectedPredictionId,
    setSelectedPredictionId,
  ] = useState<string | null>(null);

  const candidatesQuery = useQuery({
    queryKey: [
      "active-learning-candidates",
    ],
    queryFn: () =>
      listActiveLearningCandidates(
        null,
        null,
        100,
        0,
      ),
  });

  const candidates =
    useMemo<ActiveLearningItem[]>(
      () =>
        candidatesQuery.data ?? [],
      [candidatesQuery.data],
    );

  const availableReasons =
    useMemo<string[]>(() => {
      return Array.from(
        new Set<string>(
          candidates.flatMap(
            (
              candidate:
                ActiveLearningItem,
            ) =>
              candidate
                .selection_reasons,
          ),
        ),
      ).sort();
    }, [candidates]);

  const filteredCandidates =
    useMemo(() => {
      const search =
        searchValue
          .trim()
          .toLowerCase();

      const result =
        candidates.filter(
          (candidate) => {
            const matchesTask =
              taskFilter === "all" ||
              candidate.task ===
                taskFilter;

            const matchesPriority =
              priorityFilter === "all" ||
              candidate.priority_level ===
                priorityFilter;

            const matchesReason =
              reasonFilter === "all" ||
              candidate.selection_reasons
                .includes(
                  reasonFilter,
                );

            if (
              !matchesTask ||
              !matchesPriority ||
              !matchesReason
            ) {
              return false;
            }

            if (!search) {
              return true;
            }

            return (
              getPredictionText(
                candidate,
              )
                .toLowerCase()
                .includes(search) ||
              candidate.prediction_id
                .toLowerCase()
                .includes(search) ||
              candidate.model_name
                .toLowerCase()
                .includes(search) ||
              candidate.predicted_label
                .toLowerCase()
                .includes(search) ||
              candidate.selection_reasons
                .some((reason) =>
                  reason
                    .toLowerCase()
                    .includes(search),
                )
            );
          },
        );

      return [...result].sort(
        (left, right) => {
          if (
            sortOption ===
            "lowest_confidence"
          ) {
            return (
              left.confidence -
              right.confidence
            );
          }

          if (
            sortOption === "newest"
          ) {
            return (
              new Date(
                right.created_at,
              ).getTime() -
              new Date(
                left.created_at,
              ).getTime()
            );
          }

          return (
            right.priority_score -
            left.priority_score
          );
        },
      );
    }, [
      candidates,
      searchValue,
      taskFilter,
      priorityFilter,
      reasonFilter,
      sortOption,
    ]);

  const selectedCandidate =
    candidates.find(
      (candidate) =>
        candidate.prediction_id ===
        selectedPredictionId,
    ) ?? null;

  const highPriorityCount =
    candidates.filter(
      (candidate) =>
        candidate.priority_level ===
        "high",
    ).length;

  const mediumPriorityCount =
    candidates.filter(
      (candidate) =>
        candidate.priority_level ===
        "medium",
    ).length;

  const disagreementCount =
    candidates.filter(
      (candidate) =>
        candidate.selection_reasons
          .includes(
            "user_disagreement",
          ),
    ).length;

  const averageConfidence =
    candidates.length > 0
      ? candidates.reduce(
          (total, candidate) =>
            total +
            candidate.confidence,
          0,
        ) / candidates.length
      : null;

  if (candidatesQuery.isLoading) {
    return (
      <section className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({
            length: 4,
          }).map((_, index) => (
            <div
              key={index}
              className="h-36 animate-pulse rounded-xl border bg-muted/30"
            />
          ))}
        </div>

        <div className="h-44 animate-pulse rounded-xl border bg-muted/30" />

        <div className="h-96 animate-pulse rounded-xl border bg-muted/30" />
      </section>
    );
  }

  if (candidatesQuery.error) {
    return (
      <section className="gh-panel p-6">
        <AlertCircle className="size-8 text-red-600" />

        <h2 className="mt-4 text-xl font-semibold">
          Active learning queue could
          not load
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">
          {getApiErrorMessage(
            candidatesQuery.error,
            "Unable to load active-learning candidates.",
          )}
        </p>

        <Button
          className="mt-5"
          onClick={() => {
            void candidatesQuery.refetch();
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
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ActiveLearningStatCard
            label="Total candidates"
            value={candidates.length}
            description="Ranked predictions requiring attention"
            icon={BrainCircuit}
          />

          <ActiveLearningStatCard
            label="High priority"
            value={highPriorityCount}
            description={`${mediumPriorityCount} medium-priority candidates`}
            icon={CircleAlert}
          />

          <ActiveLearningStatCard
            label="Average confidence"
            value={
              averageConfidence === null
                ? "—"
                : formatPercentage(
                    averageConfidence,
                  )
            }
            description="Mean confidence across the queue"
            icon={Gauge}
          />

          <ActiveLearningStatCard
            label="User disagreement"
            value={disagreementCount}
            description="Candidates with incorrect feedback"
            icon={MessageSquareWarning}
          />
        </section>

        <section className="gh-panel p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
              <Filter className="size-5" />
            </div>

            <div>
              <h2 className="font-semibold">
                Candidate filters
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Filter predictions by
                research priority, task,
                and selection reason.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-5">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

              <input
                value={searchValue}
                onChange={(event) =>
                  setSearchValue(
                    event.target.value,
                  )
                }
                placeholder="Search text, model, label, ID, or reason..."
                className="gh-input w-full !pl-10"
              />
            </div>

            <select
              value={taskFilter}
              onChange={(event) =>
                setTaskFilter(
                  event.target
                    .value as TaskFilter,
                )
              }
              className="gh-input min-w-0"
            >
              <option value="all">
                All tasks
              </option>

              <option value="hate_speech">
                Hate speech
              </option>

              <option value="sentiment">
                Sentiment
              </option>
            </select>

            <select
              value={priorityFilter}
              onChange={(event) =>
                setPriorityFilter(
                  event.target
                    .value as PriorityFilter,
                )
              }
              className="gh-input min-w-0"
            >
              <option value="all">
                All priorities
              </option>

              <option value="high">
                High priority
              </option>

              <option value="medium">
                Medium priority
              </option>

              <option value="low">
                Low priority
              </option>
            </select>

            <select
              value={sortOption}
              onChange={(event) =>
                setSortOption(
                  event.target
                    .value as SortOption,
                )
              }
              className="gh-input min-w-0"
            >
              <option value="priority">
                Highest priority
              </option>

              <option value="lowest_confidence">
                Lowest confidence
              </option>

              <option value="newest">
                Newest prediction
              </option>
            </select>
          </div>

          <div className="mt-4">
            <label
              htmlFor="active-learning-reason"
              className="text-xs font-medium text-muted-foreground"
            >
              Selection reason
            </label>

            <select
              id="active-learning-reason"
              value={reasonFilter}
              onChange={(event) =>
                setReasonFilter(
                  event.target.value,
                )
              }
              className="mt-2 gh-input w-full lg:max-w-md"
            >
              <option value="all">
                All selection reasons
              </option>

              {availableReasons.map(
                (reason) => (
                  <option
                    key={reason}
                    value={reason}
                  >
                    {formatWords(reason)}
                  </option>
                ),
              )}
            </select>
          </div>
        </section>

        <section className="overflow-hidden gh-panel">
          <div className="flex flex-col gap-3 bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">
                Ranked candidate queue
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Showing{" "}
                {filteredCandidates.length}{" "}
                of {candidates.length}{" "}
                candidates.
              </p>
            </div>

            <Badge variant="outline">
              <Sparkles className="mr-1 size-3" />
              Priority ranked
            </Badge>
          </div>

          {filteredCandidates.length >
          0 ? (
            <div className="overflow-x-auto border-t">
              <table className="gh-table w-full min-w-[1180px] text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">
                      Priority
                    </th>

                    <th className="px-4 py-3 font-medium">
                      Prediction
                    </th>

                    <th className="px-4 py-3 font-medium">
                      Model output
                    </th>

                    <th className="px-4 py-3 font-medium">
                      Confidence
                    </th>

                    <th className="px-4 py-3 font-medium">
                      Selection reasons
                    </th>

                    <th className="px-4 py-3 font-medium">
                      Feedback
                    </th>

                    <th className="px-4 py-3 font-medium">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredCandidates.map(
                    (candidate) => (
                      <tr
                        key={
                          candidate
                            .prediction_id
                        }
                        className="border-t align-top"
                      >
                        <td className="px-4 py-3">
                          <Badge
                            variant="outline"
                            className={cn(
                              getPriorityClass(
                                candidate
                                  .priority_level,
                              ),
                            )}
                          >
                            {formatWords(
                              candidate
                                .priority_level,
                            )}
                          </Badge>

                          <p className="mt-2 text-lg font-bold">
                            {formatScore(
                              candidate
                                .priority_score,
                            )}
                          </p>

                          <p className="text-xs text-muted-foreground">
                            Priority score
                          </p>
                        </td>

                        <td className="max-w-sm px-4 py-3">
                          <p className="line-clamp-3 font-medium">
                            {getPredictionText(
                              candidate,
                            )}
                          </p>

                          <p className="mt-2 text-xs text-muted-foreground">
                            {formatWords(
                              candidate.task,
                            )}
                          </p>
                        </td>

                        <td className="px-4 py-3">
                          <Badge variant="secondary">
                            {formatWords(
                              candidate
                                .predicted_label,
                            )}
                          </Badge>

                          <p className="mt-2 max-w-xs text-xs text-muted-foreground">
                            {
                              candidate
                                .model_name
                            }{" "}
                            v
                            {
                              candidate
                                .model_version
                            }
                          </p>
                        </td>

                        <td className="px-4 py-3">
                          <p className="font-semibold">
                            {formatPercentage(
                              candidate
                                .confidence,
                            )}
                          </p>

                          <p className="mt-2 text-xs text-muted-foreground">
                            Margin:{" "}
                            {candidate
                              .probability_margin ===
                            null
                              ? "—"
                              : formatPercentage(
                                  candidate
                                    .probability_margin,
                                )}
                          </p>
                        </td>

                        <td className="max-w-sm px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {candidate
                              .selection_reasons
                              .slice(0, 3)
                              .map(
                                (reason) => (
                                  <Badge
                                    key={reason}
                                    variant="outline"
                                  >
                                    {formatWords(
                                      reason,
                                    )}
                                  </Badge>
                                ),
                              )}
                          </div>

                          {candidate
                            .selection_reasons
                            .length > 3 && (
                            <p className="mt-2 text-xs text-muted-foreground">
                              +
                              {candidate
                                .selection_reasons
                                .length -
                                3}{" "}
                              more reasons
                            </p>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <p className="font-semibold">
                            {
                              candidate
                                .feedback.total
                            }{" "}
                            records
                          </p>

                          <p className="mt-2 text-xs text-muted-foreground">
                            {
                              candidate
                                .feedback
                                .incorrect
                            }{" "}
                            incorrect ·{" "}
                            {
                              candidate
                                .feedback
                                .unsure
                            }{" "}
                            unsure
                          </p>
                        </td>

                        <td className="px-4 py-3">
                          <Button
                            size="sm"
                            onClick={() =>
                              setSelectedPredictionId(
                                candidate
                                  .prediction_id,
                              )
                            }
                          >
                            Inspect
                            <ArrowUpRight className="ml-2 size-4" />
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
              <Target className="mx-auto size-9 text-muted-foreground" />

              <h3 className="mt-4 font-semibold">
                No candidates found
              </h3>

              <p className="mt-2 text-sm text-muted-foreground">
                No active-learning
                candidates match the
                selected filters.
              </p>
            </div>
          )}
        </section>
      </section>

      <ActiveLearningDrawer
        candidate={selectedCandidate}
        onClose={() =>
          setSelectedPredictionId(
            null,
          )
        }
      />
    </>
  );
}

function ActiveLearningDrawer({
  candidate,
  onClose,
}: {
  candidate:
    | ActiveLearningItem
    | null;
  onClose: () => void;
}) {
  if (!candidate) {
    return null;
  }

  const probabilities =
    Object.entries(
      candidate.probabilities ?? {},
    ).sort(
      (left, right) =>
        right[1] - left[1],
    );

  return (
    <>
      <button
        type="button"
        aria-label="Close candidate evidence"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40"
      />

      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto border-l bg-background shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 p-5 backdrop-blur">
          <div>
            <p className="text-xs font-medium text-violet-700 dark:text-violet-300">
              Active learning evidence
            </p>

            <h2 className="mt-1 text-xl font-semibold">
              Candidate inspection
            </h2>
          </div>

          <Button
            size="icon"
            variant="outline"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="space-y-5 p-4">
          <section className="rounded-lg border p-5">
            <p className="text-xs text-muted-foreground">
              Original Bangla text
            </p>

            <p className="mt-3 text-lg leading-8">
              {getPredictionText(
                candidate,
              )}
            </p>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <CandidateDetail
              label="Priority"
              value={`${formatWords(
                candidate.priority_level,
              )} · ${formatScore(
                candidate.priority_score,
              )}`}
            />

            <CandidateDetail
              label="Confidence"
              value={formatPercentage(
                candidate.confidence,
              )}
            />

            <CandidateDetail
              label="Predicted label"
              value={formatWords(
                candidate.predicted_label,
              )}
            />

            <CandidateDetail
              label="Task"
              value={formatWords(
                candidate.task,
              )}
            />
          </section>

          <section className="rounded-lg border p-5">
            <h3 className="font-semibold">
              Selection reasons
            </h3>

            <div className="mt-4 flex flex-wrap gap-2">
              {candidate
                .selection_reasons
                .map((reason) => (
                  <Badge
                    key={reason}
                    variant="outline"
                  >
                    {formatWords(
                      reason,
                    )}
                  </Badge>
                ))}
            </div>
          </section>

          <section className="rounded-lg border p-5">
            <div className="flex items-center gap-2">
              <Layers3 className="size-5 text-violet-600" />

              <h3 className="font-semibold">
                Model probabilities
              </h3>
            </div>

            {probabilities.length > 0 ? (
              <div className="mt-4 space-y-3">
                {probabilities.map(
                  ([label, value]) => (
                    <div
                      key={label}
                      className="rounded-xl border p-3"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm font-medium">
                          {formatWords(
                            label,
                          )}
                        </span>

                        <span className="text-sm font-semibold">
                          {formatPercentage(
                            value,
                          )}
                        </span>
                      </div>

                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-violet-600"
                          style={{
                            width: `${Math.max(
                              0,
                              Math.min(
                                100,
                                value <= 1
                                  ? value *
                                    100
                                  : value,
                              ),
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Probability data is not
                available for this
                prediction.
              </p>
            )}
          </section>

          <section className="rounded-lg border p-5">
            <h3 className="font-semibold">
              Human feedback evidence
            </h3>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <CandidateDetail
                label="Total feedback"
                value={String(
                  candidate.feedback
                    .total,
                )}
              />

              <CandidateDetail
                label="Correct"
                value={String(
                  candidate.feedback
                    .correct,
                )}
              />

              <CandidateDetail
                label="Incorrect"
                value={String(
                  candidate.feedback
                    .incorrect,
                )}
              />

              <CandidateDetail
                label="Unsure"
                value={String(
                  candidate.feedback
                    .unsure,
                )}
              />

              <CandidateDetail
                label="Reviewed"
                value={String(
                  candidate.feedback
                    .reviewed,
                )}
              />

              <CandidateDetail
                label="Rejected"
                value={String(
                  candidate.feedback
                    .rejected,
                )}
              />
            </div>
          </section>

          <section className="rounded-lg border bg-muted/30 p-5">
            <p className="text-xs text-muted-foreground">
              Model
            </p>

            <p className="mt-2 font-semibold">
              {candidate.model_name} v
              {candidate.model_version}
            </p>

            <p className="mt-4 text-xs text-muted-foreground">
              Prediction created
            </p>

            <p className="mt-2 text-sm font-medium">
              {formatDateTime(
                candidate.created_at,
              )}
            </p>

            <p className="mt-4 break-all font-mono text-xs text-muted-foreground">
              {candidate.prediction_id}
            </p>
          </section>
        </div>
      </aside>
    </>
  );
}

function ActiveLearningStatCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  description: string;
  icon: typeof BrainCircuit;
}) {
  return (
    <article className="gh-panel p-5">
      <div className="flex items-start justify-between gap-4">
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

      <p className="mt-4 text-xs text-muted-foreground">
        {description}
      </p>
    </article>
  );
}

function CandidateDetail({
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

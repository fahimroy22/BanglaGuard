"use client";

import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  ClipboardList,
  Database,
  Filter,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getApiErrorMessage } from "@/lib/api";
import { getAuditLog, listAuditLogs } from "@/lib/audit-logs";
import { useAuthStore } from "@/store/auth-store";

import type { AuditLogQuery, AuditLogRead } from "@/types/audit-log";

const PAGE_SIZE = 25;

type AuditFilters = {
  search: string;
  action: string;
  resourceType: string;
  userId: string;
  createdFrom: string;
  createdTo: string;
};

const emptyFilters: AuditFilters = {
  search: "",
  action: "",
  resourceType: "",
  userId: "",
  createdFrom: "",
  createdTo: "",
};

function formatWords(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  return value
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function formatRelativeDate(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  const difference = Date.now() - parsed.getTime();

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (difference < minute) {
    return "Just now";
  }

  if (difference < hour) {
    const minutes = Math.floor(difference / minute);

    return `${minutes}m ago`;
  }

  if (difference < day) {
    const hours = Math.floor(difference / hour);

    return `${hours}h ago`;
  }

  if (difference < 7 * day) {
    const days = Math.floor(difference / day);

    return `${days}d ago`;
  }

  return formatDateTime(value);
}

function toIsoDateTime(value: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}

function getActorName(item: AuditLogRead): string {
  return item.user_full_name ?? item.user_email ?? "System / deleted user";
}

function getActionBadgeClasses(action: string): string {
  if (action.includes("registered") || action.includes("created")) {
    return (
      "border-emerald-200 bg-emerald-50 " +
      "text-emerald-700 " +
      "dark:border-emerald-900 " +
      "dark:bg-emerald-950/40 " +
      "dark:text-emerald-300"
    );
  }

  if (
    action.includes("download") ||
    action.includes("viewed") ||
    action.includes("previewed")
  ) {
    return (
      "border-blue-200 bg-blue-50 " +
      "text-blue-700 " +
      "dark:border-blue-900 " +
      "dark:bg-blue-950/40 " +
      "dark:text-blue-300"
    );
  }

  if (action.includes("executed") || action.includes("prepared")) {
    return (
      "border-violet-200 bg-violet-50 " +
      "text-violet-700 " +
      "dark:border-violet-900 " +
      "dark:bg-violet-950/40 " +
      "dark:text-violet-300"
    );
  }

  return (
    "border-slate-300 bg-slate-50 " +
    "text-slate-700 " +
    "dark:border-slate-700 " +
    "dark:bg-slate-900 " +
    "dark:text-slate-300"
  );
}

function DetailField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1.5 border-b border-border py-3 last:border-b-0 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-5">
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>

      <div
        className={
          mono
            ? "min-w-0 break-all font-mono text-xs text-foreground"
            : "min-w-0 break-words text-sm text-foreground"
        }
      >
        {value || "—"}
      </div>
    </div>
  );
}

export function AuditLogsWorkspace() {
  const currentUser = useAuthStore((state) => state.user);

  const isAdmin = currentUser?.role === "admin";

  const [draftFilters, setDraftFilters] = useState<AuditFilters>(emptyFilters);

  const [appliedFilters, setAppliedFilters] =
    useState<AuditFilters>(emptyFilters);

  const [offset, setOffset] = useState(0);

  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);

  const query = useMemo<AuditLogQuery>(
    () => ({
      search: appliedFilters.search.trim() || undefined,

      action: appliedFilters.action.trim() || undefined,

      resource_type: appliedFilters.resourceType.trim() || undefined,

      user_id: appliedFilters.userId.trim() || undefined,

      created_from: toIsoDateTime(appliedFilters.createdFrom),

      created_to: toIsoDateTime(appliedFilters.createdTo),

      limit: PAGE_SIZE,
      offset,
    }),
    [appliedFilters, offset],
  );

  const auditQuery = useQuery({
    queryKey: ["audit-logs", query],
    queryFn: () => listAuditLogs(query),
    enabled: isAdmin,
    staleTime: 30_000,
  });

  const detailQuery = useQuery({
    queryKey: ["audit-log", selectedAuditId],
    queryFn: () => getAuditLog(selectedAuditId as string),
    enabled: isAdmin && selectedAuditId !== null,
  });

  const data = auditQuery.data;

  const items = data?.items ?? [];

  const currentPage = Math.floor((data?.offset ?? offset) / PAGE_SIZE) + 1;

  const totalPages =
    data && data.total > 0 ? Math.ceil(data.total / PAGE_SIZE) : 1;

  const hasActiveFilters = Object.values(appliedFilters).some(Boolean);

  function applyFilters() {
    setOffset(0);
    setAppliedFilters({
      ...draftFilters,
    });
  }

  function clearFilters() {
    setOffset(0);
    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      applyFilters();
    }
  }

  if (!isAdmin) {
    return (
      <div className="workspace-container">
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="max-w-md text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-xl border bg-card">
              <ShieldCheck className="size-5 text-blue-600" />
            </div>

            <h1 className="mt-5 text-xl font-semibold tracking-tight">
              Admin access required
            </h1>

            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Audit logs contain administrative activity records and are
              available only to BanglaGuard administrators.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="workspace-container">
        <section className="border-b border-border pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-400">
                <ClipboardList className="size-4" />
                Administration
              </div>

              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Audit Logs
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Review recorded dataset, experiment, model and administrative
                activity across the BanglaGuard research workspace.
              </p>
            </div>

            <Button
              variant="outline"
              onClick={() => auditQuery.refetch()}
              disabled={auditQuery.isFetching}
            >
              <RefreshCw
                className={auditQuery.isFetching ? "animate-spin" : ""}
              />
              Refresh
            </Button>
          </div>
        </section>

        <section className="mt-5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Database className="size-4" />

              <span>
                <strong className="font-semibold text-foreground">
                  {data?.total ?? 0}
                </strong>{" "}
                recorded events
              </span>
            </div>

            <div className="flex items-center gap-2">
              <CircleUserRound className="size-4" />

              <span>Admin-only activity history</span>
            </div>
          </div>
        </section>

        <section
          aria-label="Audit log filters"
          className="mt-5 border-y border-border py-4"
        >
          <div className="grid gap-3 lg:grid-cols-12">
            <div className="relative lg:col-span-4">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

              <Input
                value={draftFilters.search}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    search: event.target.value,
                  }))
                }
                onKeyDown={handleSearchKeyDown}
                placeholder="Search action, resource, actor, request ID..."
                className="pl-8"
              />
            </div>

            <div className="lg:col-span-2">
              <Input
                value={draftFilters.action}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    action: event.target.value,
                  }))
                }
                onKeyDown={handleSearchKeyDown}
                placeholder="Action"
              />
            </div>

            <div className="lg:col-span-2">
              <Input
                value={draftFilters.resourceType}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    resourceType: event.target.value,
                  }))
                }
                onKeyDown={handleSearchKeyDown}
                placeholder="Resource type"
              />
            </div>

            <div className="lg:col-span-2">
              <Input
                value={draftFilters.userId}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    userId: event.target.value,
                  }))
                }
                onKeyDown={handleSearchKeyDown}
                placeholder="User UUID"
              />
            </div>

            <div className="flex gap-2 lg:col-span-2">
              <Button className="flex-1" onClick={applyFilters}>
                <Filter />
                Apply
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={clearFilters}
                disabled={
                  !hasActiveFilters &&
                  !Object.values(draftFilters).some(Boolean)
                }
                aria-label="Clear filters"
              >
                <X />
              </Button>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                From
              </span>

              <Input
                type="datetime-local"
                value={draftFilters.createdFrom}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    createdFrom: event.target.value,
                  }))
                }
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                To
              </span>

              <Input
                type="datetime-local"
                value={draftFilters.createdTo}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    createdTo: event.target.value,
                  }))
                }
              />
            </label>
          </div>
        </section>

        <section className="mt-5">
          {auditQuery.isLoading ? (
            <div className="flex min-h-64 items-center justify-center border-y border-dashed border-border">
              <div className="text-center">
                <LoaderCircle className="mx-auto size-5 animate-spin text-blue-600" />

                <p className="mt-3 text-sm font-medium">Loading audit logs</p>
              </div>
            </div>
          ) : auditQuery.error ? (
            <div className="flex min-h-64 items-center justify-center border-y border-dashed border-border">
              <div className="max-w-md text-center">
                <AlertCircle className="mx-auto size-6 text-destructive" />

                <p className="mt-3 font-medium">Unable to load audit logs</p>

                <p className="mt-2 text-sm text-muted-foreground">
                  {getApiErrorMessage(
                    auditQuery.error,
                    "The audit log request failed.",
                  )}
                </p>

                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => auditQuery.refetch()}
                >
                  Try again
                </Button>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="flex min-h-64 items-center justify-center border-y border-dashed border-border">
              <div className="max-w-md text-center">
                <ClipboardList className="mx-auto size-6 text-muted-foreground" />

                <p className="mt-3 font-medium">No audit events found</p>

                <p className="mt-2 text-sm text-muted-foreground">
                  {hasActiveFilters
                    ? "No events match the current filters."
                    : "Audit events will appear here as tracked workspace actions occur."}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:hidden">
                {items.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-xl border border-border bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Badge
                          variant="outline"
                          className={getActionBadgeClasses(item.action)}
                        >
                          {formatWords(item.action)}
                        </Badge>

                        <p className="mt-2 break-all font-mono text-[11px] leading-5 text-muted-foreground">
                          {item.action}
                        </p>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => setSelectedAuditId(item.id)}
                      >
                        View
                      </Button>
                    </div>

                    <div className="mt-4 grid gap-3 border-t border-border pt-4">
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                          Actor
                        </p>

                        <p className="mt-1 text-sm font-medium">
                          {getActorName(item)}
                        </p>

                        {item.user_email && item.user_full_name && (
                          <p className="mt-0.5 break-all text-xs text-muted-foreground">
                            {item.user_email}
                          </p>
                        )}
                      </div>

                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                          Resource
                        </p>

                        <p className="mt-1 text-sm font-medium">
                          {formatWords(item.resource_type)}
                        </p>

                        <p className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">
                          {item.resource_id ?? "No resource ID"}
                        </p>
                      </div>

                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                          Time
                        </p>

                        <p className="mt-1 text-sm">
                          {formatRelativeDate(item.created_at)}
                        </p>

                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDateTime(item.created_at)}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-hidden rounded-xl border border-border sm:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Event</TableHead>

                      <TableHead>Actor</TableHead>

                      <TableHead>Resource</TableHead>

                      <TableHead>Time</TableHead>

                      <TableHead className="w-[80px] text-right">
                        Details
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="min-w-[230px]">
                          <div className="flex flex-col items-start gap-1.5">
                            <Badge
                              variant="outline"
                              className={getActionBadgeClasses(item.action)}
                            >
                              {formatWords(item.action)}
                            </Badge>

                            <span className="max-w-[280px] truncate font-mono text-[11px] text-muted-foreground">
                              {item.action}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="min-w-[210px]">
                          <div>
                            <p className="font-medium">{getActorName(item)}</p>

                            {item.user_email && item.user_full_name && (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {item.user_email}
                              </p>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="min-w-[190px]">
                          <div>
                            <p className="font-medium">
                              {formatWords(item.resource_type)}
                            </p>

                            <p className="mt-0.5 max-w-[220px] truncate font-mono text-[11px] text-muted-foreground">
                              {item.resource_id ?? "No resource ID"}
                            </p>
                          </div>
                        </TableCell>

                        <TableCell className="min-w-[150px]">
                          <div>
                            <p className="text-sm">
                              {formatRelativeDate(item.created_at)}
                            </p>

                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {formatDateTime(item.created_at)}
                            </p>
                          </div>
                        </TableCell>

                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedAuditId(item.id)}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {data && data.total > 0 && (
            <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Showing{" "}
                <span className="font-medium text-foreground">
                  {data.offset + 1}
                </span>
                {"–"}
                <span className="font-medium text-foreground">
                  {Math.min(data.offset + data.items.length, data.total)}
                </span>{" "}
                of{" "}
                <span className="font-medium text-foreground">
                  {data.total}
                </span>{" "}
                events
              </p>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!data.has_previous || auditQuery.isFetching}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  <ChevronLeft />
                  Previous
                </Button>

                <span className="px-2 text-xs text-muted-foreground">
                  Page{" "}
                  <strong className="font-medium text-foreground">
                    {currentPage}
                  </strong>{" "}
                  of{" "}
                  <strong className="font-medium text-foreground">
                    {totalPages}
                  </strong>
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={!data.has_next || auditQuery.isFetching}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Next
                  <ChevronRight />
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>

      <Dialog
        open={selectedAuditId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedAuditId(null);
          }
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Audit event details</DialogTitle>

            <DialogDescription>
              Complete recorded metadata for this workspace event.
            </DialogDescription>
          </DialogHeader>

          {detailQuery.isLoading ? (
            <div className="flex min-h-48 items-center justify-center">
              <LoaderCircle className="size-5 animate-spin text-blue-600" />
            </div>
          ) : detailQuery.error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <div className="flex gap-3">
                <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" />

                <div>
                  <p className="font-medium">Unable to load event</p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {getApiErrorMessage(
                      detailQuery.error,
                      "The audit event could not be retrieved.",
                    )}
                  </p>
                </div>
              </div>
            </div>
          ) : detailQuery.data ? (
            <div>
              <DetailField
                label="Action"
                value={detailQuery.data.action}
                mono
              />

              <DetailField
                label="Actor"
                value={getActorName(detailQuery.data)}
              />

              <DetailField
                label="Actor email"
                value={detailQuery.data.user_email}
              />

              <DetailField
                label="User ID"
                value={detailQuery.data.user_id}
                mono
              />

              <DetailField
                label="Resource type"
                value={detailQuery.data.resource_type}
                mono
              />

              <DetailField
                label="Resource ID"
                value={detailQuery.data.resource_id}
                mono
              />

              <DetailField
                label="Request ID"
                value={detailQuery.data.request_id}
                mono
              />

              <DetailField
                label="IP address"
                value={detailQuery.data.ip_address}
                mono
              />

              <DetailField
                label="Created"
                value={formatDateTime(detailQuery.data.created_at)}
              />

              <DetailField
                label="User agent"
                value={detailQuery.data.user_agent}
              />

              <div className="pt-4">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Event details
                </p>

                <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs leading-5">
                  {JSON.stringify(detailQuery.data.details, null, 2)}
                </pre>
              </div>

              <p className="mt-4 break-all font-mono text-[10px] text-muted-foreground">
                Event ID: {detailQuery.data.id}
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

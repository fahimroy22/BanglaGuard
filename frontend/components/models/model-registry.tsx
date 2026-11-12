"use client";

import { Archive, ArchiveRestore, BrainCircuit, CheckCircle2, FlaskConical, GitCompareArrows, RefreshCw, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ModelPromotionPanel } from "./model-promotion-panel";
import { ModelComparisonPanel } from "@/components/models/model-comparison-panel";
import { ModelDetailsPanel } from "@/components/models/model-details-panel";
import { Badge } from "@/components/ui/badge";
import { getApiErrorMessage } from "@/lib/api";
import { archiveModelVersion, listModelVersions } from "@/lib/predictions";
import { useAuthStore } from "@/store/auth-store";
import type { ModelVersionRead } from "@/types/prediction";

function stage(model: ModelVersionRead) { return model.is_archived ? "archived" : model.status === "active" ? "active" : String((model.configuration?.promotion as {stage?: string} | undefined)?.stage ?? "registered candidate"); }
function taskName(task: string) { return task === "sentiment" ? "Sentiment" : "Hate speech"; }
function family(model: ModelVersionRead) { return /bert|transformer/.test(model.architecture) ? "Transformer" : /tfidf/.test(model.architecture) ? "Classical ML" : "Custom"; }
function metric(model: ModelVersionRead, key: string) {
  const value = model.metrics?.[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? `${(value * 100).toFixed(1)}%` : "—";
}

export function ModelRegistry() {
  const client = useQueryClient();
  const researcher = useAuthStore((s) => s.user?.role === "admin" || s.user?.role === "researcher");
  const [promotion, setPromotion] = useState<string | null>(null);
  const admin = useAuthStore((s) => s.user?.role === "admin");
  const query = useQuery({ queryKey: ["model-versions"], queryFn: listModelVersions, refetchOnMount: "always" });
  const models = useMemo(() => query.data ?? [], [query.data]);
  const [search, setSearch] = useState("");
  const [task, setTask] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("active");
  const [archived, setArchived] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const [action, setAction] = useState<{ model: ModelVersionRead; kind: "archive" | "restore" } | null>(null);
  const [error, setError] = useState("");
  const mutation = useMutation({
    retry: false,
    mutationFn: async (value: NonNullable<typeof action>) => {
      return archiveModelVersion({ id: value.model.id, archived: value.kind === "archive" });
    },
    onSuccess: async (_, value) => {
      setAction(null); setError(""); setSelected([]);
      toast.success(value.kind === "archive" ? "Model archived. You can restore it from Archived." : "Model restored.");
      await client.invalidateQueries({ queryKey: ["model-versions"] });
    },
    onError: (err) => setError(err instanceof Error && !('response' in err) ? err.message : getApiErrorMessage(err, "Unable to update this model.")),
  });
  const visible = useMemo(() => models.filter((m) => Boolean(m.is_archived) === archived && (task === "all" || m.task === task) && (status === "all" || stage(m) === status) && `${m.name} ${m.version} ${m.architecture}`.toLowerCase().includes(search.toLowerCase().trim())).sort((a,b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "active" && a.status !== b.status) return Number(b.status === "active") - Number(a.status === "active");
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  }), [models, archived, task, status, search, sort]);
  const comparisonModels = models.filter((m) => selected.includes(m.id));
  function prompt(model: ModelVersionRead, kind: NonNullable<typeof action>["kind"]) { setError(""); setAction({ model, kind }); }
  function resetFilters() { setSearch(""); setTask("all"); setStatus("all"); setSort("active"); }

  return <div className="min-h-full bg-background"><div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-5 lg:px-6">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
      <div><h1 className="text-2xl font-semibold tracking-tight">Model registry</h1><p className="mt-1 text-sm text-muted-foreground">Review trained models, choose active versions and manage your archive.</p></div>
      <div className="flex gap-2"><button className="gh-button" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} />Refresh</button><Link className="gh-button gh-button-primary" href="/experiments/new"><FlaskConical className="size-4" />New experiment</Link></div>
    </header>
    <section aria-label="Registry summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[["Available models", models.filter(m => !m.is_archived).length], ["Active models", models.filter(m => m.status === "active").length], ["Sentiment models", models.filter(m => m.task === "sentiment" && !m.is_archived).length], ["Archived models", models.filter(m => m.is_archived).length]].map(([label, count]) => <div className="gh-panel p-4" key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{query.isPending || query.isError ? "—" : count}</p></div>)}
    </section>
    <section className="gh-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex gap-2" aria-label="Registry view">{[false, true].map(value => <button key={String(value)} className={`gh-button ${archived === value ? "gh-button-primary" : ""}`} aria-pressed={archived === value} onClick={() => { setArchived(value); setSelected([]); }}>{value ? <Archive className="size-4" /> : <BrainCircuit className="size-4" />}{value ? "Archived" : "Available"}</button>)}</div>
        <span className="text-xs text-muted-foreground">{admin ? "Administrator controls" : researcher ? "Researcher reviews & activation requests" : "Read-only access"}</span>
      </div>
      <div className="grid gap-3 border-b p-4 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr]">
        <label className="space-y-1 text-xs font-medium">Search models<div className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><input className="gh-input w-full !pl-9" placeholder="Name, version or architecture" value={search} onChange={e => setSearch(e.target.value)} /></div></label>
        <Filter label="Task" value={task} onChange={setTask} options={[["all","All tasks"],["sentiment","Sentiment"],["hate_speech","Hate speech"]]} />
        <Filter label="Status" value={status} onChange={setStatus} options={[["all","All statuses"],["active","Active"],["registered candidate","Registered candidate"],["evaluated","Evaluated"],["approved","Approved"]]} />
        <Filter label="Sort" value={sort} onChange={setSort} options={[["active","Active first"],["newest","Newest first"],["name","Name"]]} />
      </div>
      {selected.length > 0 && <div className="flex flex-wrap items-center gap-3 border-b bg-muted/20 px-4 py-3"><span className="text-sm">{selected.length} of 2 models selected</span><button className="gh-button" disabled={selected.length !== 2} onClick={() => setCompare(true)}><GitCompareArrows className="size-4" />Compare</button><button className="gh-button" onClick={() => setSelected([])}><X className="size-4" />Clear</button></div>}
      {query.isPending ? <div role="status" className="p-12 text-center text-sm text-muted-foreground">Loading models…</div> : query.isError ? <div role="alert" className="p-10 text-center"><p>{getApiErrorMessage(query.error, "Unable to load models.")}</p><button className="gh-button mt-4" onClick={() => void query.refetch()}>Try again</button></div> : <>
        <div className="overflow-x-auto"><table className="gh-table w-full"><thead><tr><th scope="col">Compare</th><th scope="col">Model</th><th scope="col">Task / family</th><th scope="col">Status</th><th scope="col">Accuracy</th><th scope="col">Macro F1</th><th scope="col">Actions</th></tr></thead>
          <tbody>{visible.map(model => <tr key={model.id}>
            <td><input type="checkbox" aria-label={`Compare ${model.name} v${model.version}`} checked={selected.includes(model.id)} disabled={selected.length === 2 && !selected.includes(model.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, model.id] : ids.filter(id => id !== model.id))} /></td>
            <td className="min-w-60"><button className="text-left font-semibold text-primary hover:underline" onClick={() => setDetails(model.id)}>{model.name}</button><div className="mt-1 text-xs text-muted-foreground">v{model.version} · Registered {new Date(model.created_at).toLocaleDateString()}</div></td>
            <td><div className="whitespace-nowrap text-sm">{taskName(model.task)}</div><div className="mt-1 text-xs text-muted-foreground">{family(model)}</div></td>
            <td><Badge variant="outline" className={model.status === "active" && !model.is_archived ? "text-emerald-700 dark:text-emerald-300" : ""}>{model.is_archived ? "Archived" : model.status === "active" ? <><CheckCircle2 className="mr-1 size-3" />Active</> : String((model.configuration?.promotion as {stage?: string} | undefined)?.stage ?? "Registered candidate")}</Badge>{Boolean((model.configuration?.promotion as {request?: unknown} | undefined)?.request) && stage(model)==="evaluated" && <p className="mt-1 text-xs text-primary">Awaiting admin review</p>}</td>
            <td className="tabular-nums">{metric(model,"accuracy")}</td><td className="tabular-nums">{metric(model,"macro_f1")}</td>
            <td><div className="flex flex-wrap gap-2"><button className="gh-button" onClick={() => setDetails(model.id)}>Details</button>{researcher && <button className="gh-button" onClick={() => setPromotion(model.id)}>Model card & lifecycle</button>}{admin && (model.is_archived ? <button className="gh-button" disabled={mutation.isPending} onClick={() => prompt(model,"restore")}><ArchiveRestore className="size-4" />Restore</button> : model.status !== "active" ? <><button className="gh-button" disabled={mutation.isPending} onClick={() => prompt(model,"archive")}><Archive className="size-4" />Archive</button></> : null)}</div></td>
          </tr>)}</tbody></table></div>
        {visible.length === 0 && <div className="p-10 text-center"><p className="font-medium">{archived ? "No archived models match this view" : "No models match this view"}</p><p className="mt-1 text-sm text-muted-foreground">{archived ? "Archived models remain available here for review and restoration." : "Adjust your filters or register a completed experiment."}</p><button className="gh-button mt-4" onClick={resetFilters}>Clear filters</button></div>}
        <div className="border-t px-4 py-3 text-xs text-muted-foreground">{visible.length} models · Compare scores only when the task, dataset and evaluation split match. Active models must be replaced before archiving.</div>
      </>}
    </section>
    {promotion && <ModelPromotionPanel key={promotion} modelId={promotion} onClose={() => setPromotion(null)}/>}
    <ModelDetailsPanel model={models.find(m => m.id === details) ?? null} open={details !== null} onClose={() => setDetails(null)} />
    <ModelComparisonPanel models={comparisonModels} open={compare && comparisonModels.length === 2} onClose={() => setCompare(false)} />
    {action && <dialog open ref={element => { if (element && !element.matches(':modal')) { element.close(); element.showModal(); } }} onCancel={event => { event.preventDefault(); if (!mutation.isPending) setAction(null); }} className="fixed inset-0 z-50 m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border bg-background p-6 text-foreground shadow-xl backdrop:bg-black/40" aria-labelledby="model-action-title">
      <h2 id="model-action-title" className="text-lg font-semibold">{action.kind === "archive" ? "Archive model" : action.kind === "restore" ? "Restore model" : "Activate model"}</h2><p className="mt-3 break-words font-medium">{action.model.name} v{action.model.version}</p>
      <p className="mt-2 text-sm text-muted-foreground">{action.kind === "archive" ? "Hide this version from available models and prediction choices. Its files, results and history are preserved. You can restore it later." : action.kind === "restore" ? "Return this version to available models. Its previous status is preserved; restoration does not activate it." : `Use this version for future ${taskName(action.model.task).toLowerCase()} predictions. The current active model for this task will be retired.`}</p>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-6 flex justify-end gap-2"><button className="gh-button" disabled={mutation.isPending} onClick={() => setAction(null)}>Cancel</button><button className="gh-button gh-button-primary" disabled={mutation.isPending} onClick={() => mutation.mutate(action)}>{mutation.isPending ? "Updating…" : "Confirm"}</button></div>
    </dialog>}
  </div></div>;
}

function Filter({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) {
  return <label className="space-y-1 text-xs font-medium">{label}<select className="gh-input block w-full" value={value} onChange={e => onChange(e.target.value)}>{options.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>;
}

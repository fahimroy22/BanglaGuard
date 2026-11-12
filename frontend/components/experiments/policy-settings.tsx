"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, getApiErrorMessage } from "@/lib/api";

type Role = "researcher" | "user";
type Policy = { revision: number; permissions: Record<string, Role[]>; security: { registration_enabled: boolean; approval_required: boolean; session_minutes: number; failed_login_limit: number; lockout_minutes: number } };
const labels: Record<string, string> = { research_view: "View research datasets and experiments", dataset_upload: "Upload, register, and clean datasets", dataset_export: "Export and download dataset files", experiment_create: "Create and configure experiments", training_execute: "Execute training", model_register: "Register trained models", prediction_run: "Run single and batch predictions" };
export function PolicySettings({ section }: { section: "permissions" | "security" }) {
  const query = useQuery({queryKey: ["admin", "policy"], queryFn: async () => (await api.get<Policy>("/admin/policy")).data});
  if (query.isPending) return <p className="p-4">Loading platform settings…</p>;
  if (query.isError) return <div role="alert" className="p-4">{getApiErrorMessage(query.error)}<button className="gh-button ml-3" onClick={() => void query.refetch()}>Retry</button></div>;
  return <PolicyEditor key={`${section}-${query.data.revision}`} initial={query.data} section={section} refresh={() => query.refetch()} />;
}
function PolicyEditor({initial, section, refresh}: {initial: Policy; section: "permissions" | "security"; refresh: () => Promise<unknown>}) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState(false);
  const [message, setMessage] = useState("");
  const changed = JSON.stringify(initial) !== JSON.stringify(draft);
  function security<K extends keyof Policy["security"]>(key: K, value: Policy["security"][K]) {setReview(false);setDraft({...draft, security: {...draft.security, [key]: value}});}
  async function save() {
    setSaving(true);setMessage("");
    try {await api.put("/admin/policy", draft);await refresh();}
    catch (e) {setMessage(getApiErrorMessage(e));}
    finally {setSaving(false);}
  }
  const changes = section === "permissions" ? Object.keys(labels).filter((key) => JSON.stringify(draft.permissions[key]) !== JSON.stringify(initial.permissions[key])).map((key) => `${labels[key]}: ${draft.permissions[key].join(", ") || "administrators only"}`) : Object.keys(draft.security).filter((key) => draft.security[key as keyof Policy["security"]] !== initial.security[key as keyof Policy["security"]]).map((key) => `${key.replaceAll("_", " ")}: ${String(draft.security[key as keyof Policy["security"]])}`);
  return <section className="rounded-xl border border-border bg-card p-4">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{section === "permissions" ? "Research permissions" : "Security settings"}</h2><p className="mt-1 text-xs text-muted-foreground">Saved revision {initial.revision}. Administrator access is always retained.</p></div><button disabled={saving} className="gh-button" onClick={() => {setDraft(initial);setReview(false);setMessage("");void refresh();}}>Reload saved settings</button></header>
    <fieldset disabled={saving} className="mt-4">
    {section === "permissions" ? <><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="py-3">Capability</th><th>Researcher</th><th>User</th><th>Admin</th></tr></thead><tbody className="divide-y divide-border">{Object.entries(labels).map(([key,label]) => <tr key={key}><td className="py-3 pr-3">{label}</td>{(["researcher", "user"] as Role[]).map((role) => <td key={role}><input aria-label={`${role}: ${label}`} type="checkbox" checked={draft.permissions[key].includes(role)} disabled={key !== "research_view" && key !== "prediction_run" && !draft.permissions.research_view.includes(role)} onChange={(e) => {const permissions = {...draft.permissions, [key]: e.target.checked ? [...draft.permissions[key], role] : draft.permissions[key].filter((r) => r !== role)};if(key === "research_view" && !e.target.checked) for(const k of Object.keys(permissions)) if(k !== "prediction_run") permissions[k] = permissions[k].filter((r) => r !== role);setDraft({...draft, permissions});setReview(false);}} /></td>)}<td className="text-muted-foreground">Always allowed</td></tr>)}</tbody></table></div><p className="mt-3 text-xs text-muted-foreground">Research actions require view access. Changes apply to subsequent requests; running jobs continue. Model activation remains administrator-only.</p></> : <div className="grid gap-4 md:grid-cols-2">
      <label className="rounded-lg border border-border p-3"><span className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={draft.security.registration_enabled} onChange={(e) => security("registration_enabled", e.target.checked)} />Allow public registration</span><span className="mt-1 block text-xs text-muted-foreground">When disabled, new self-service registrations are rejected.</span></label>
      <label className="rounded-lg border border-border p-3"><span className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={draft.security.approval_required} onChange={(e) => security("approval_required", e.target.checked)} />Require approval for new accounts</span><span className="mt-1 block text-xs text-muted-foreground">New accounts remain inactive until activated in Users & access.</span></label>
      {([ ["session_minutes", "Session duration (minutes)", 5, 10080], ["failed_login_limit", "Failed-login limit (0 disables)", 0, 20], ["lockout_minutes", "Lockout window (minutes)", 1, 1440] ] as const).map(([key,label,min,max]) => <label key={key} className="text-sm">{label}<input type="number" min={min} max={max} step="1" className="gh-input mt-1" value={draft.security[key]} onChange={(e) => security(key, e.target.valueAsNumber)} /></label>)}
      <p className="text-xs leading-5 text-muted-foreground">Session duration applies to new logins. Failed attempts are counted per email and IP within the lockout window; successful login resets the counter. The existing 10-attempts-per-minute IP limit also remains in effect. Login protection requires Redis when enabled.</p>
    </div>}
    </fieldset>
    <footer className="mt-4 border-t border-border pt-3"><button className="gh-button gh-button-primary" disabled={!changed || saving} onClick={() => setReview(true)}>Review changes</button>{review ? <div className="mt-3 rounded-lg bg-muted/40 p-3"><h3 className="text-sm font-medium">Confirm platform policy changes</h3><ul className="my-2 list-inside list-disc text-xs">{changes.map((value) => <li key={value}>{value}</li>)}</ul><div className="flex gap-2"><button className="gh-button gh-button-primary" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Confirm and save"}</button><button className="gh-button" disabled={saving} onClick={() => setReview(false)}>Cancel</button></div></div> : null}{message ? <p role="alert" className="mt-3 text-sm">{message}</p> : null}</footer>
  </section>;
}

"use client";

import { PolicySettings } from "@/components/experiments/policy-settings";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { api, getApiErrorMessage } from "@/lib/api";
import { listAuditLogs } from "@/lib/audit-logs";
import { useAuthStore } from "@/store/auth-store";
import type { User } from "@/types/auth";

type Health = { status: string; services: { database: string; redis: string } };
const card = "rounded-xl border border-border bg-card p-4";

export default function AdministrationPage() {
  const user = useAuthStore((state) => state.user);
  const initializing = useAuthStore((state) => state.isInitializing);
  const admin = !initializing && user?.role === "admin";
  const [selected, setSelected] = useState<User | null>(null);
  const [editRole, setEditRole] = useState<User["role"]>("user");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<"access" | "sessions" | null>(null);
  const [tab, setTab] = useState("users");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const users = useQuery({ queryKey: ["admin", "users", user?.id], enabled: admin,
    queryFn: async () => (await api.get<User[]>("/users")).data });
  const health = useQuery({ queryKey: ["admin", "health", user?.id], enabled: admin,
    queryFn: async () => (await api.get<Health>("/health/ready", { validateStatus: (code) => code === 200 || code === 503 })).data });
  const audit = useQuery({ queryKey: ["admin", "audit", user?.id], enabled: admin,
    queryFn: () => listAuditLogs({ limit: 6, offset: 0 }) });
  async function applyChange() {
    if (!selected || !confirmation) return;
    setSaving(true); setMessage("");
    try {
      if (confirmation === "access") await api.patch(`/users/${selected.id}/access`, { role: editRole, is_active: active });
      else await api.post(`/users/${selected.id}/revoke-sessions`);
      setSelected(null); setConfirmation(null);
      setMessage("User access updated. Previous sessions are revoked.");
      await Promise.all([users.refetch(), audit.refetch()]);
    } catch (error) { setMessage(getApiErrorMessage(error)); }
    finally { setSaving(false); }
  }
  if (initializing) return <p className="p-6 text-muted-foreground">Checking access…</p>;
  if (!admin) return <div className="p-6"><h1 className="text-xl font-semibold">Administrator access required</h1><p className="mt-2 text-muted-foreground">This page is available to administrators.</p><Link href="/dashboard" className="gh-button mt-4">Return to dashboard</Link></div>;
  const records = users.data ?? [];
  const filtered = records.filter((item) => `${item.full_name} ${item.email}`.toLowerCase().includes(search.trim().toLowerCase()) && (role === "all" || item.role === role) && (status === "all" || item.is_active === (status === "active")));
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const current = Math.min(page, pages);
  const busy = users.isFetching || health.isFetching || audit.isFetching;
  const roles = ["admin", "researcher", "user"] as const;
  const max = Math.max(1, ...roles.map((value) => records.filter((item) => item.role === value).length));
  return <main className="min-h-full bg-background"><div className="mx-auto max-w-[1600px] space-y-4 px-4 py-5 lg:px-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-semibold"><ShieldCheck className="size-6 text-primary" />Administration</h1><p className="mt-1 text-sm text-muted-foreground">Review user access, service health, and recent activity.</p></div><button type="button" className="gh-button" disabled={busy} onClick={() => void Promise.all([users.refetch(), health.refetch(), audit.refetch()])}><RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />Refresh</button></header>
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Account summary">
      {[["Accounts", records.length], ["Active", records.filter((item) => item.is_active).length], ["Administrators", records.filter((item) => item.role === "admin").length], ["Inactive", records.filter((item) => !item.is_active).length]].map(([label, value]) => <div className={card} key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{users.isPending ? "…" : users.isError ? "—" : value}</p></div>)}
    </section>
    <nav className="flex flex-wrap gap-2 border-b border-border pb-2" aria-label="Administration sections">{[["users", "Users & access"], ["permissions", "Research permissions"], ["security", "Security settings"], ["system", "System & activity"]].map(([id, label]) => <button key={id} className={`gh-button ${tab === id ? "gh-button-primary" : ""}`} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {message && !selected ? <p role="status" className="rounded-lg border border-border p-3 text-sm">{message}</p> : null}
    {tab === "permissions" || tab === "security" ? <PolicySettings section={tab} /> : null}
    {tab === "system" ? <div className="grid items-start gap-3 lg:grid-cols-3">
      <section className={card}><h2 className="font-semibold">Service health</h2><p className="mt-1 text-xs text-muted-foreground">Database and Redis connectivity from the readiness check.</p>
        {health.isPending ? <p className="mt-4 text-sm">Checking services…</p> : health.isError ? <ErrorMessage error={health.error} /> : <><dl className="mt-3 divide-y divide-border">{[["Readiness", health.data.status.replaceAll("_", " ")], ["Database", health.data.services.database], ["Redis", health.data.services.redis]].map(([label, value]) => <div key={label} className="flex justify-between gap-2 py-2 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className={`capitalize font-medium ${value === "connected" || value === "ready" ? "text-[var(--gh-success-fg)]" : "text-[var(--gh-danger-fg)]"}`}>{value}</dd></div>)}</dl><p className="mt-2 text-xs text-muted-foreground">Checked {new Date(health.dataUpdatedAt).toLocaleTimeString()}</p></>}
      </section>
      <section className={card}><h2 className="font-semibold">Account roles</h2><p className="mt-1 text-xs text-muted-foreground">All accounts · choose a role to filter the directory.</p>{users.isPending ? <p className="py-8 text-sm">Loading roles…</p> : users.isError ? <p className="py-8 text-sm text-muted-foreground">Role counts unavailable.</p> : <><svg viewBox="0 0 340 140" className="h-36 w-full" role="img" aria-label={roles.map((r) => `${r}: ${records.filter((u) => u.role === r).length}`).join(", ")}><line x1="25" x2="325" y1="112" y2="112" stroke="var(--border)" />{roles.map((r, i) => { const count = records.filter((u) => u.role === r).length; const height = count / max * 78; return <g key={r}><rect x={52 + i * 95} y={112 - height} width="43" height={height} rx="4" fill={`var(--chart-${i + 1})`}><title>{r}: {count}</title></rect><text x={74 + i * 95} y={105 - height} textAnchor="middle" fontSize="12" fill="var(--foreground)">{count}</text><text x={74 + i * 95} y="130" textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">{r}</text></g>; })}</svg><div className="flex flex-wrap gap-1">{["all", ...roles].map((r) => <button type="button" key={r} aria-pressed={role === r} onClick={() => {setRole(r);setPage(1);}} className={`rounded-md border px-2 py-1 text-xs capitalize ${role === r ? "border-primary text-primary" : "border-border"}`}>{r}</button>)}</div></> }</section>
      <section className={card}><div className="flex justify-between gap-2"><h2 className="font-semibold">Recent activity</h2><Link href="/audit-logs" className="text-xs text-primary hover:underline">View all</Link></div>{audit.isPending ? <p className="py-6 text-sm">Loading activity…</p> : audit.isError ? <ErrorMessage error={audit.error} /> : audit.data.items.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No audit events recorded.</p> : <ul className="mt-2 max-h-52 divide-y divide-border overflow-auto">{audit.data.items.map((event) => <li key={event.id} className="py-2"><p className="break-words text-xs font-medium">{event.action.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-muted-foreground">{event.user_full_name ?? event.user_email ?? "System / unknown actor"} · {date(event.created_at)}</p></li>)}</ul>}</section>
    </div> : null}
    {tab === "users" ? <section className="overflow-hidden rounded-xl border border-border bg-card"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4"><div><h2 className="font-semibold">User directory</h2><p className="mt-1 text-xs text-muted-foreground">Manage roles, login access, and existing sessions. Access changes require a fresh login.</p></div><span className="text-xs text-muted-foreground">{users.isSuccess ? `${filtered.length} matching accounts` : ""}</span></header>
      <div className="grid gap-2 border-b border-border p-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]"><input aria-label="Search users" className="gh-input" placeholder="Search name or email" value={search} onChange={(e) => {setSearch(e.target.value);setPage(1);}} /><select aria-label="Filter account role" className="gh-input" value={role} onChange={(e) => {setRole(e.target.value);setPage(1);}}><option value="all">All roles</option>{roles.map((r) => <option key={r} value={r}>{r}</option>)}</select><select aria-label="Filter account status" className="gh-input" value={status} onChange={(e) => {setStatus(e.target.value);setPage(1);}}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
      {users.isPending ? <p className="p-6 text-sm">Loading accounts…</p> : users.isError ? <div className="p-4"><ErrorMessage error={users.error} /></div> : filtered.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No accounts match these filters.</p> : <><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr>{["Account", "Role", "Status", "Joined", "Actions"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{filtered.slice((current - 1) * 10, current * 10).map((item) => <tr key={item.id}><td className="px-4 py-3"><p className="font-medium">{item.full_name}{item.id === user?.id ? " (you)" : ""}</p><p className="text-xs text-muted-foreground">{item.email}</p></td><td className="px-4 py-3 capitalize">{item.role}</td><td className="px-4 py-3">{item.is_active ? "Active" : "Inactive"}</td><td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{date(item.created_at)}</td><td className="px-4 py-3"><button className="gh-button" disabled={item.id === user?.id} title={item.id === user?.id ? "Another administrator must manage your access" : "Manage account access"} onClick={() => {setSelected(item);requestAnimationFrame(() => document.querySelector('[aria-label="Manage selected account"]')?.scrollIntoView({block: "center", behavior: "smooth"}));setEditRole(item.role);setActive(item.is_active);setConfirmation(null);setMessage("");}}>Manage</button></td></tr>)}</tbody></table></div><footer className="flex items-center justify-between border-t border-border p-3 text-xs"><span>Page {current} of {pages}</span><div className="flex gap-2"><button className="gh-button" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button><button className="gh-button" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</button></div></footer></>}
    </section> : null}
    {selected ? <section className="rounded-xl border-2 border-primary bg-card p-5" aria-label="Manage selected account">
      <header className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Manage {selected.full_name}</h2><p className="text-sm text-muted-foreground">{selected.email}</p></div><button className="gh-button" disabled={saving} onClick={() => setSelected(null)}>Close</button></header>
      <div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-sm">Role<select className="gh-input mt-1" disabled={saving} value={editRole} onChange={(e) => {setEditRole(e.target.value as User["role"]);setConfirmation(null);}}>{roles.map((r) => <option key={r} value={r}>{r}</option>)}</select></label><label className="text-sm">Login access<select className="gh-input mt-1" disabled={saving} value={active ? "active" : "inactive"} onChange={(e) => {setActive(e.target.value === "active");setConfirmation(null);}}><option value="active">Active — allow login</option><option value="inactive">Inactive — block access</option></select></label></div>
      <p className="mt-3 text-xs text-muted-foreground">Deactivation blocks new logins and subsequent authenticated requests. Reactivation requires a fresh login. Work already running on the server is not cancelled.</p>
      <div className="mt-4 flex flex-wrap gap-2"><button className="gh-button gh-button-primary" disabled={saving || (active === selected.is_active && editRole === selected.role)} onClick={() => setConfirmation("access")}>Review access changes</button><button className="gh-button" disabled={saving} onClick={() => setConfirmation("sessions")}>Revoke existing sessions</button><Link className="gh-button" href="/audit-logs">Audit history</Link></div>
      {confirmation ? <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3"><p className="text-sm">{confirmation === "access" ? `Change ${selected.email} to ${editRole}, ${active ? "active" : "inactive"}? Existing sessions will be revoked.` : `Revoke all existing sessions for ${selected.email}? Account status and role remain unchanged.`}</p><div className="mt-3 flex gap-2"><button className="gh-button gh-button-primary" disabled={saving} onClick={() => void applyChange()}>{saving ? "Saving…" : "Confirm"}</button><button className="gh-button" disabled={saving} onClick={() => setConfirmation(null)}>Cancel</button></div></div> : null}
      {message ? <p role="alert" className="mt-3 text-sm">{message}</p> : null}
    </section> : null}
  </div></main>;
}
function ErrorMessage({ error }: { error: unknown }) { return <p role="alert" className="mt-3 text-sm text-[var(--gh-danger-fg)]">{getApiErrorMessage(error)}</p>; }
function date(value: string) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "Unknown date" : parsed.toLocaleString(); }

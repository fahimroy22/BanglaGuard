"use client";

import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  FlaskConical,
  Upload,
} from "lucide-react";

import { useAuthStore } from "@/store/auth-store";

function getFirstName(fullName?: string | null) {
  if (!fullName?.trim()) {
    return "Researcher";
  }

  const parts = fullName.trim().split(/\s+/);

  if (
    parts[0]?.toLowerCase() === "md." ||
    parts[0]?.toLowerCase() === "md"
  ) {
    return parts[1] ?? parts[0];
  }

  return parts[0];
}

export function DashboardHero() {
  const user = useAuthStore((state) => state.user);
  const firstName = getFirstName(user?.full_name);

  return (
    <section className="relative overflow-hidden border-b bg-[var(--gh-canvas)]">
      <div className="relative mx-auto max-w-[1440px] px-6 py-16 sm:px-8 lg:px-10 lg:py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gh-fg-muted)]">
          BanglaGuard Research Platform
        </p>

        <div className="mt-5 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
          <div>
            <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.035em] text-[var(--gh-fg-default)] sm:text-5xl lg:text-6xl">
              Continue your Bangla NLP research, {firstName}.
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--gh-fg-muted)] sm:text-lg">
              Prepare data, train reproducible models, run inference and
              evaluate research evidence from one focused workspace.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/prediction"
                className="gh-button gh-button-primary h-10 px-4"
              >
                <BrainCircuit className="size-4" />
                Run prediction
                <ArrowRight className="size-4" />
              </Link>

              <Link
                href="/datasets"
                className="gh-button h-10 px-4"
              >
                <Upload className="size-4" />
                Dataset workspace
              </Link>

              <Link
                href="/experiments"
                className="gh-button h-10 px-4"
              >
                <FlaskConical className="size-4" />
                New experiment
              </Link>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0 dark:border-slate-800">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Active session
            </p>

            <dl className="mt-5 space-y-4">
              <SessionRow
                label="Account"
                value={user?.email ?? "Unavailable"}
              />

              <SessionRow
                label="Role"
                value={formatRole(user?.role)}
              />

              <SessionRow
                label="Environment"
                value="Research"
              />

              <SessionRow
                label="Status"
                value="Authenticated"
                active
              />
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

type SessionRowProps = {
  label: string;
  value: string;
  active?: boolean;
};

function SessionRow({
  label,
  value,
  active = false,
}: SessionRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-sm text-slate-500 dark:text-slate-400">
        {label}
      </dt>

      <dd
        className={
          active
            ? "truncate text-sm font-medium text-blue-700 dark:text-blue-400"
            : "truncate text-sm font-medium text-slate-900 dark:text-slate-100"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function formatRole(role?: string | null) {
  if (!role) {
    return "Researcher";
  }

  return role
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

"use client";

import { Search, Bell, Sun } from "lucide-react";

export function TopBar() {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background px-8">

      <div className="flex items-center gap-4">
        <Search className="h-4 w-4 text-muted-foreground" />

        <input
          placeholder="Search models, datasets, experiments..."
          className="w-96 bg-transparent text-sm outline-none"
        />
      </div>

      <div className="flex items-center gap-4">

        <button className="rounded-lg p-2 hover:bg-muted">
          <Bell className="h-5 w-5" />
        </button>

        <button className="rounded-lg p-2 hover:bg-muted">
          <Sun className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3">

          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
            F
          </div>

          <div className="leading-tight">
            <div className="text-sm font-medium">
              MD. Fahim Ahmed
            </div>

            <div className="text-xs text-muted-foreground">
              Administrator
            </div>

          </div>

        </div>

      </div>

    </header>
  );
}
"use client";

import {
  Laptop,
  Moon,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ModeToggle() {
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="relative"
            aria-label="Change color theme"
          />
        }
      >
        <Sun
          className="
            size-4 scale-100 rotate-0 transition-all
            dark:scale-0 dark:-rotate-90
          "
          aria-hidden="true"
        />

        <Moon
          className="
            absolute size-4 scale-0 rotate-90 transition-all
            dark:scale-100 dark:rotate-0
          "
          aria-hidden="true"
        />

        <span className="sr-only">
          Change color theme
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => setTheme("light")}
        >
          <Sun className="size-4" />
          Light
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => setTheme("dark")}
        >
          <Moon className="size-4" />
          Dark
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => setTheme("system")}
        >
          <Laptop className="size-4" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import Link from "next/link";

import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  compact?: boolean;
};

export function BrandLogo({
  className,
  compact = false,
}: BrandLogoProps) {
  return (
    <Link
      href="/"
      className={cn(
        "group inline-flex items-center gap-3",
        className,
      )}
      aria-label="BanglaGuard homepage"
    >
      <span
        className="
          relative flex size-10 shrink-0 items-center justify-center
          overflow-hidden rounded-xl border border-emerald-500/20
          bg-gradient-to-br from-emerald-500 to-teal-700
          text-lg font-bold text-white shadow-sm
        "
        aria-hidden="true"
      >
        ব
        <span className="absolute -right-2 -top-2 size-5 rounded-full bg-white/20" />
      </span>

      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-lg font-bold tracking-tight text-foreground">
            BanglaGuard
          </span>

          <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Bangla NLP Research
          </span>
        </span>
      )}
    </Link>
  );
}

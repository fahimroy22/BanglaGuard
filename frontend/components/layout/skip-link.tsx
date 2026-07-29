export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="
        fixed left-4 top-4 z-[100]
        -translate-y-24 rounded-lg
        bg-foreground px-4 py-2
        text-sm font-semibold text-background
        shadow-lg transition-transform
        focus:translate-y-0
      "
    >
      Skip to main content
    </a>
  );
}

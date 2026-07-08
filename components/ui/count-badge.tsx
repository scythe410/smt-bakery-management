// Small red count pill (DESIGN.md §2/§4): brand-red fill, white text. Renders
// nothing when count <= 0 — badges only appear when there's something to show.
// Caps at 99+ so it never blows out the layout. Position it from the caller
// (e.g. absolute, top-right of an icon).

export function CountBadge({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={`bg-brand text-brand-white flex h-4 min-w-4 items-center justify-center rounded-pill px-1 text-[10px] leading-none font-semibold tabular-nums ${className}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

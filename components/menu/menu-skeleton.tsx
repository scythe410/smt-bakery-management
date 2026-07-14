// Loading skeleton for the Menu screen (DESIGN.md §6 — skeleton shapes).

export function MenuSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {/* toolbar */}
      <div className="flex items-center gap-2">
        <div className="bg-surface-2 h-9 flex-1 animate-pulse rounded-[var(--radius)]" />
        <div className="bg-surface-2 h-9 w-24 animate-pulse rounded-[var(--radius)]" />
      </div>
      {/* rows */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="border-border bg-surface flex items-center gap-3 rounded-[var(--radius)] border p-4 shadow-[var(--shadow-card)]"
        >
          <div className="bg-surface-2 size-10 animate-pulse rounded-[var(--radius)]" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="bg-surface-2 h-4 w-3/5 animate-pulse rounded" />
            <div className="bg-surface-2 h-3 w-2/5 animate-pulse rounded" />
          </div>
          <div className="bg-surface-2 h-5 w-16 animate-pulse rounded-[var(--radius-pill)]" />
        </div>
      ))}
    </div>
  );
}

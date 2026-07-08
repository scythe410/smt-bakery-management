// Card — the base surface for every stat block and section (DESIGN.md §4):
// white surface, hairline border, 12px radius, soft card shadow, 16px padding.
// No hooks, so it renders on the server. Pass `className` to tune spacing/layout
// per use; keep the visual identity here so a re-theme touches one file.

import type { ReactNode } from "react";

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={`bg-surface border-border shadow-card rounded-[var(--radius)] border p-4 ${className}`}
    >
      {children}
    </div>
  );
}

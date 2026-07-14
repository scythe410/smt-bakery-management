"use client";

import { Printer } from "lucide-react";

export function PrintBillButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="bg-brand text-brand-white text-label hover:bg-brand-ember flex h-10 items-center gap-2 rounded-[var(--radius)] px-4 font-semibold transition-colors"
    >
      <Printer className="size-4" aria-hidden />
      {label}
    </button>
  );
}

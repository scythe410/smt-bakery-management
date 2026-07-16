"use client";

// Production error boundary (DESIGN.md §6): state what happened and the fix, with a
// retry — no apology, no spinner. Client component (error boundaries must be).

import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";

export default function ProductionError({ reset }: { error: Error; reset: () => void }) {
  const { t } = useTranslation();

  return (
    <Card className="flex flex-col items-start gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-h2 text-ink">{t("production.errorState.title")}</p>
        <p className="text-body text-muted">{t("production.errorState.body")}</p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="bg-brand text-brand-white text-label hover:bg-brand-ember focus-visible:ring-brand/40 flex h-11 items-center justify-center rounded-[var(--radius)] px-4 font-semibold outline-none transition-colors focus-visible:ring-2"
      >
        {t("production.errorState.retry")}
      </button>
    </Card>
  );
}

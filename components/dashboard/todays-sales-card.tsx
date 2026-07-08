"use client";

// Today's Sales — the hero money figure (SPEC §3.1, DESIGN.md §1). Oversized
// Archivo display face, tabular numerals. Gross sales are a neutral total, so
// the figure is inked in --text, not sign-colored (DESIGN.md §2). Client
// component so the label re-translates instantly on the language toggle; money
// is pre-computed in the selector and only formatted here (CLAUDE.md §3).

import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { formatLKR } from "@/lib/format";

export function TodaysSalesCard({ salesCents }: { salesCents: number }) {
  const { t } = useTranslation();
  return (
    <Card>
      <p className="text-caption text-muted tracking-wide uppercase">
        {t("dashboard.todaysSales")}
      </p>
      <p className="font-display text-display-xl text-ink mt-1 tabular-nums">
        {formatLKR(salesCents)}
      </p>
    </Card>
  );
}

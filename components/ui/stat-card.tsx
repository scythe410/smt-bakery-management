"use client";

// StatCard (DESIGN.md §4): small uppercase muted label on top, big figure below
// in the Archivo display face, sign/semantic-colored. Reusable across Finance,
// Reports, etc. Client component so the label re-translates instantly; money is
// pre-computed in a selector and only formatted here (formatLKR — render-time
// only, CLAUDE.md §3). Pass `cents` for money or `count` for a plain integer.

import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { formatLKR } from "@/lib/format";

export type StatTone = "ink" | "success" | "ember" | "danger";

const TONE_CLASS: Record<StatTone, string> = {
  ink: "text-ink",
  success: "text-success",
  ember: "text-brand-ember",
  danger: "text-danger",
};

const COUNT_FMT = new Intl.NumberFormat("en-US");

export function StatCard({
  labelKey,
  cents,
  count,
  tone = "ink",
  estimated = false,
  className = "",
}: {
  labelKey: string;
  cents?: number;
  count?: number;
  tone?: StatTone;
  /** Appends an "Est." qualifier to the label (CLAUDE.md §3). */
  estimated?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const value = cents != null ? formatLKR(cents) : count != null ? COUNT_FMT.format(count) : "—";

  return (
    <Card className={className}>
      <p className="text-caption text-muted flex items-center gap-1 tracking-wide uppercase">
        <span className="truncate">{t(labelKey)}</span>
        {estimated ? (
          <span className="text-faint normal-case">· {t("finance.overview.estimated")}</span>
        ) : null}
      </p>
      <p className={`font-display text-display-lg mt-1 tabular-nums ${TONE_CLASS[tone]}`}>
        {value}
      </p>
    </Card>
  );
}

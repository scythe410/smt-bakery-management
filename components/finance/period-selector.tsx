"use client";

// Period selector (SPEC §3.2): Today / This Week / This Month / Custom, in the
// URL so the choice is server-rendered, shareable, and shared across all three
// tabs. Non-custom kinds navigate immediately; Custom reveals From/To date
// inputs and applies on the button (so a half-entered range never navigates).

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_PERIOD_KIND,
  PERIOD_KINDS,
  type PeriodKindParam,
} from "@/lib/finance/period-params";

export function PeriodSelector() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentKind = (searchParams.get("period") as PeriodKindParam) ?? DEFAULT_PERIOD_KIND;
  const [kind, setKind] = useState<PeriodKindParam>(
    PERIOD_KINDS.includes(currentKind) ? currentKind : DEFAULT_PERIOD_KIND,
  );
  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");

  function navigate(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value == null || value === "") params.delete(key);
      else params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function onKindChange(value: PeriodKindParam) {
    setKind(value);
    // Non-custom kinds apply at once; custom waits for both dates + Apply.
    if (value !== "custom") navigate({ period: value, from: undefined, to: undefined });
  }

  const selectId = "finance-period";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label
          htmlFor={selectId}
          className="text-caption text-muted shrink-0 tracking-wide uppercase"
        >
          {t("finance.period.label")}
        </label>
        <select
          id={selectId}
          value={kind}
          onChange={(e) => onKindChange(e.target.value as PeriodKindParam)}
          className="border-border text-label text-ink focus-visible:ring-brand/40 bg-surface h-9 flex-1 rounded-[var(--radius)] border px-2 outline-none focus-visible:ring-2"
        >
          <option value="today">{t("finance.period.today")}</option>
          <option value="week">{t("finance.period.week")}</option>
          <option value="month">{t("finance.period.month")}</option>
          <option value="custom">{t("finance.period.custom")}</option>
        </select>
      </div>

      {kind === "custom" ? (
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-caption text-muted">{t("finance.period.from")}</span>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="border-border text-label text-ink focus-visible:ring-brand/40 bg-surface h-9 rounded-[var(--radius)] border px-2 outline-none focus-visible:ring-2"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-caption text-muted">{t("finance.period.to")}</span>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="border-border text-label text-ink focus-visible:ring-brand/40 bg-surface h-9 rounded-[var(--radius)] border px-2 outline-none focus-visible:ring-2"
            />
          </label>
          <button
            type="button"
            disabled={!from || !to}
            onClick={() => navigate({ period: "custom", from, to })}
            className="bg-brand text-brand-white text-label hover:bg-brand-ember h-9 shrink-0 rounded-[var(--radius)] px-3 font-semibold transition-colors disabled:opacity-50"
          >
            {t("finance.period.apply")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

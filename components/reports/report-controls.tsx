"use client";

// Report controls (SPEC §3.5): the report-type dropdown (Daily Sales selected;
// the list is extensible) and the date picker, both held in the URL so each
// selection is server-rendered from the derived selector and is shareable. The
// date defaults to today — the page resolves the tenant's current day and passes
// it in, so an empty URL still shows a concrete date here.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  REPORT_TYPES,
  SALARY_RANGES,
  type ReportType,
  type SalaryRange,
} from "@/lib/reports/report-params";

export function ReportControls({
  reportType,
  date,
  range,
  from,
  to,
}: {
  reportType: ReportType;
  date: string;
  range: SalaryRange;
  from?: string;
  to?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function navigate(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  const fieldClass =
    "border-border text-label text-ink focus-visible:ring-brand/40 bg-surface h-9 flex-1 rounded-[var(--radius)] border px-2 outline-none focus-visible:ring-2";
  const labelClass = "text-caption text-muted w-16 shrink-0 tracking-wide uppercase";

  // Salaries is reviewed over a window; the others report a single day. The range
  // picker + custom from/to only render for Salaries; everyone else sees the anchor
  // date, which for Day/Week/Month is the point the window is computed around.
  const isSalaries = reportType === "salaries";
  const isCustom = isSalaries && range === "custom";

  return (
    <div className="flex flex-col gap-2 print:hidden">
      <div className="flex items-center gap-2">
        <label htmlFor="report-type" className={labelClass}>
          {t("reports.type.label")}
        </label>
        <select
          id="report-type"
          value={reportType}
          onChange={(e) => navigate({ type: e.target.value })}
          className={fieldClass}
        >
          {REPORT_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`reports.type.${type}`)}
            </option>
          ))}
        </select>
      </div>

      {isSalaries ? (
        <div className="flex items-center gap-2">
          <label htmlFor="report-range" className={labelClass}>
            {t("reports.range.label")}
          </label>
          <select
            id="report-range"
            value={range}
            onChange={(e) => navigate({ range: e.target.value })}
            className={fieldClass}
          >
            {SALARY_RANGES.map((r) => (
              <option key={r} value={r}>
                {t(`reports.range.${r}`)}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {isCustom ? (
        <>
          <div className="flex items-center gap-2">
            <label htmlFor="report-from" className={labelClass}>
              {t("reports.range.from")}
            </label>
            <input
              id="report-from"
              type="date"
              value={from ?? date}
              onChange={(e) => e.target.value && navigate({ from: e.target.value })}
              className={fieldClass}
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="report-to" className={labelClass}>
              {t("reports.range.to")}
            </label>
            <input
              id="report-to"
              type="date"
              value={to ?? date}
              onChange={(e) => e.target.value && navigate({ to: e.target.value })}
              className={fieldClass}
            />
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <label htmlFor="report-date" className={labelClass}>
            {isSalaries ? t("reports.range.anchor") : t("reports.date.label")}
          </label>
          <input
            id="report-date"
            type="date"
            value={date}
            onChange={(e) => e.target.value && navigate({ date: e.target.value })}
            className={fieldClass}
          />
        </div>
      )}
    </div>
  );
}

"use client";

// The one caveat the Daily Sales report owes the reader: the headline Revenue /
// Commission / Net Revenue / Orders count COMPLETED orders only, so a pending or
// cancelled row in the detail table below is real but excluded from those
// figures. Stated plainly rather than hidden (CLAUDE.md §3 "Correctness").

import { useTranslation } from "react-i18next";

export function ReportNote() {
  const { t } = useTranslation();
  return <p className="text-caption text-faint">{t("reports.note")}</p>;
}

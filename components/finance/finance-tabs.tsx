"use client";

// Finance tab bar (SPEC §3.2): Overview / Expenses / Platform Earnings. Tabs are
// links that carry the current period params along, so switching tabs keeps the
// selected period. Active tab in brand red with an underline (DESIGN.md §2);
// others muted. 44px tap height.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";

const TABS = [
  { key: "overview", labelKey: "finance.tabs.overview" },
  { key: "expenses", labelKey: "finance.tabs.expenses" },
  { key: "platform", labelKey: "finance.tabs.platformEarnings" },
] as const;

export function FinanceTabs({ active }: { active: string }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function hrefFor(tab: string): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    return `${pathname}?${params.toString()}`;
  }

  return (
    <div role="tablist" className="border-border flex gap-1 border-b">
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <Link
            key={tab.key}
            href={hrefFor(tab.key)}
            role="tab"
            aria-selected={isActive}
            className={`text-label flex min-h-11 items-center border-b-2 px-3 font-medium transition-colors ${
              isActive ? "border-brand text-brand" : "text-muted hover:text-ink border-transparent"
            }`}
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </div>
  );
}

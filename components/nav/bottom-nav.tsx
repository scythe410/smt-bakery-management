"use client";

// Persistent bottom navigation (DESIGN.md §4). Fixed, phone-width, safe-area
// aware. Role-filtered: staff only ever sees its permitted items (canAccess).
// Active item in brand red; others muted. Live badges on Inventory (low-stock)
// and Menu, rendered only when > 0. Nine items are tight at ~390px, so the row
// scrolls horizontally rather than dropping items, with a 44px min tap target.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useAppContext } from "@/components/app/app-provider";
import { CountBadge } from "@/components/ui/count-badge";
import { canAccess } from "@/lib/access";
import type { ShellBadges } from "@/lib/db/selectors/shell";
import { NAV_ITEMS } from "@/components/nav/nav-items";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav({ badges }: { badges: ShellBadges }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { profile } = useAppContext();

  const items = NAV_ITEMS.filter((item) => canAccess(profile.role, item.section));

  return (
    <nav
      aria-label={t("nav.label")}
      className="border-border bg-surface fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[430px] border-t pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex items-stretch overflow-x-auto">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const count = item.badge ? badges[item.badge] : 0;
          return (
            <li key={item.section} className="min-w-[44px] flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`focus-visible:ring-brand/40 relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 outline-none focus-visible:ring-2 ${
                  active ? "text-brand" : "text-muted hover:text-ink"
                }`}
              >
                <span className="relative">
                  <item.Icon className="size-5" strokeWidth={active ? 2.25 : 2} aria-hidden />
                  <CountBadge count={count} className="absolute -top-1.5 -right-2.5" />
                </span>
                <span className="text-[11px] leading-none font-medium">{t(item.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

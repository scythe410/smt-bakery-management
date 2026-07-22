"use client";

// Persistent bottom navigation (DESIGN.md §4). Fixed, phone-width, safe-area
// aware. Role-filtered: staff only ever sees its permitted items (canAccess).
// Active item in brand red; others muted. Live badges on Inventory (low-stock)
// and Menu, rendered only when > 0. Nine items are tight at ~390px, so the row
// scrolls horizontally rather than dropping items, with a 44px min tap target.
//
// Pending feedback (DESIGN.md §4/§7): on tap, the target item lights up in brand
// red immediately and its icon becomes a spinner for the duration of the
// navigation (Next `useLinkStatus`), so a tap never reads as a freeze on a slow
// hop. Motion is restrained + reduced-motion aware: under prefers-reduced-motion
// the spinner is suppressed (globals.css zeroes animations) and the instant
// colour change carries the feedback on its own.

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useAppContext } from "@/components/app/app-provider";
import { CountBadge } from "@/components/ui/count-badge";
import { canAccess } from "@/lib/access";
import type { ShellBadges } from "@/lib/db/selectors/shell";
import { NAV_ITEMS, type NavItem } from "@/components/nav/nav-items";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Inner content of a nav <Link>. Lives in its own component so it can read
// `useLinkStatus()` — the pending state of the nearest parent Link — and react
// to a tap before the destination's skeleton mounts.
function NavItemContent({
  item,
  active,
  count,
  label,
}: {
  item: NavItem;
  active: boolean;
  count: number;
  label: string;
}) {
  const { pending } = useLinkStatus();
  const lit = active || pending;

  return (
    <span
      aria-busy={pending || undefined}
      className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${
        lit ? "text-brand" : "text-muted group-hover:text-ink"
      }`}
    >
      <span className="relative inline-flex">
        {/* While pending, the icon yields to a spinner (motion) or stays put
            under reduced motion, where the spinner is hidden. */}
        <item.Icon
          className={`size-[22px] ${pending ? "opacity-0 motion-reduce:opacity-100" : ""}`}
          strokeWidth={active ? 2.25 : 2}
          aria-hidden
        />
        {pending ? (
          <Loader2 className="absolute inset-0 size-[22px] animate-spin motion-reduce:hidden" aria-hidden />
        ) : null}
        <CountBadge count={count} className="absolute -top-1.5 -right-2.5" />
      </span>
      <span className="text-[12px] leading-none font-medium whitespace-nowrap">{label}</span>
    </span>
  );
}

export function BottomNav({ badges }: { badges: ShellBadges }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { profile } = useAppContext();

  const items = NAV_ITEMS.filter((item) => canAccess(profile.role, item.section));

  return (
    <nav
      aria-label={t("nav.label")}
      className="border-border bg-surface fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[430px] border-t pb-[env(safe-area-inset-bottom)] print:hidden"
    >
      <ul className="scrollbar-none flex items-stretch overflow-x-auto">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const count = item.badge ? badges[item.badge] : 0;
          return (
            <li key={item.section} className="min-w-[44px] shrink-0 grow">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="group focus-visible:ring-brand/40 relative flex min-h-[58px] items-stretch justify-center px-2 py-1.5 outline-none focus-visible:ring-2"
              >
                <NavItemContent
                  item={item}
                  active={active}
                  count={count}
                  label={t(item.labelKey)}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

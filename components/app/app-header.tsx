"use client";

// Sticky shell header (DESIGN.md §4): screen title on the left, action cluster
// on the right (language switch, notification bell with live unread count,
// sign-out). The title is derived from the active route via the shared nav
// registry, so it stays in lockstep with the bottom nav and goes through i18n.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { BrandLogo } from "@/components/ui/brand-logo";
import { LanguageToggle } from "@/components/nav/language-toggle";
import { NotificationBell } from "@/components/nav/notification-bell";
import { SignOutButton } from "@/components/app/sign-out-button";
import { NAV_ITEMS } from "@/components/nav/nav-items";

function titleKeyFor(pathname: string): string {
  const match = NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  return match ? match.labelKey : "appName";
}

export function AppHeader({ unreadCount }: { unreadCount: number }) {
  const { t } = useTranslation();
  const pathname = usePathname();

  return (
    <header className="border-border bg-surface sticky top-0 z-20 flex items-center justify-between gap-2 border-b px-4 py-2 print:hidden">
      <div className="flex min-w-0 items-center gap-2">
        <Link href="/dashboard" aria-label={t("appName")} className="shrink-0">
          <BrandLogo alt={t("appName")} className="h-7" priority />
        </Link>
        <h1 className="font-display text-h1 text-ink truncate">{t(titleKeyFor(pathname))}</h1>
      </div>
      <div className="flex items-center gap-0.5">
        <LanguageToggle />
        <NotificationBell count={unreadCount} />
        <SignOutButton label={t("shell.signOut")} />
      </div>
    </header>
  );
}

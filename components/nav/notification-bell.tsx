"use client";

// Header notification bell with the live unread count (DESIGN.md §4). The count
// is computed server-side (RLS-scoped) and passed in. The notifications panel
// is a later step; for now this is the accessible, badged control.

import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CountBadge } from "@/components/ui/count-badge";

export function NotificationBell({ count }: { count: number }) {
  const { t } = useTranslation();
  const label =
    count > 0
      ? `${t("shell.notifications")} — ${t("shell.unread", { count })}`
      : t("shell.notifications");

  return (
    <button
      type="button"
      aria-label={label}
      className="text-ink hover:bg-surface-2 focus-visible:ring-brand/40 relative flex size-11 items-center justify-center rounded-[var(--radius)] outline-none focus-visible:ring-2"
    >
      <Bell className="size-5" aria-hidden />
      <CountBadge count={count} className="absolute top-1.5 right-1.5" />
    </button>
  );
}

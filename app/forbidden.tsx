// 403 boundary — rendered when requireRole() calls forbidden() for a role that
// isn't allowed into a section (CLAUDE.md §5). Enabled via
// experimental.authInterrupts in next.config.ts. Copy is i18n'd; the page
// carries HTTP 403.

import Link from "next/link";
import { getCurrentLanguage } from "@/lib/auth";
import { getT } from "@/i18n/server";

export default async function Forbidden() {
  const { t } = await getT(await getCurrentLanguage());

  return (
    <main className="bg-surface-2 flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <div className="bg-surface border-border shadow-card flex w-full max-w-[390px] flex-col items-center gap-4 rounded-[var(--radius)] border p-6">
        <span className="font-display text-display-lg text-danger">403</span>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-h1 text-ink">{t("forbidden.title")}</h1>
          <p className="text-body text-muted">{t("forbidden.body")}</p>
        </div>
        <Link
          href="/dashboard"
          className="bg-brand text-brand-white text-label hover:bg-brand-ember flex h-11 w-full items-center justify-center rounded-[var(--radius)] font-semibold transition-colors"
        >
          {t("forbidden.back")}
        </Link>
      </div>
    </main>
  );
}

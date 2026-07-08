// Dashboard — landing screen for every role. Full build lands in a later step;
// for now it confirms the authenticated shell renders. requireProfile() also
// re-asserts the session at the page level (defence in depth alongside the layout).

import { getCurrentLanguage, requireProfile } from "@/lib/auth";
import { getT } from "@/i18n/server";

export default async function DashboardPage() {
  await requireProfile();
  const { t } = await getT(await getCurrentLanguage());

  return (
    <section className="flex flex-col gap-2">
      <h1 className="font-display text-h1 text-ink">{t("dashboard.title")}</h1>
      <p className="text-body text-muted">{t("dashboard.comingSoon")}</p>
    </section>
  );
}

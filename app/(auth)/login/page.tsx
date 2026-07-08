// Login screen (DESIGN.md §5, §4): centered logo above an email/password form.
// Already-authenticated users are bounced to the app. Server-rendered heading;
// the form is a Client Component (needs action state + client i18n).

import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { Logo } from "@/components/ui/logo";
import { getT } from "@/i18n/server";
import { getCurrentLanguage, getUser } from "@/lib/auth";

export default async function LoginPage() {
  if (await getUser()) {
    redirect("/dashboard");
  }

  const { t } = await getT(await getCurrentLanguage());

  return (
    <main className="bg-surface-2 flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="bg-surface border-border shadow-card flex w-full max-w-[390px] flex-col items-center gap-6 rounded-[var(--radius)] border p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo name={t("appName")} size="lg" />
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-h1 text-ink">{t("login.title")}</h1>
            <p className="text-body text-muted">{t("login.subtitle")}</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}

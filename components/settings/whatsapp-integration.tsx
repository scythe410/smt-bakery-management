"use client";

// Settings › Integrations — WhatsApp Business API (SPEC §4.4). This is a
// PLACEHOLDER: BizCore is a WhatsApp-native product, but the actual API
// connection (embedded signup, phone-number provisioning, token exchange) is not
// in scope for this build — it's shown as "Not connected" with a disabled action
// so the surface exists without pretending to work. Flagged pending client
// confirmation of the integration scope.

import { useTranslation } from "react-i18next";
import { MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";

export function WhatsAppIntegration() {
  const { t } = useTranslation();

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-h2 text-ink">{t("settings.integrations.title")}</h2>

      <div className="border-border flex items-center gap-3 rounded-[var(--radius)] border p-3">
        <span className="bg-success-bg text-success flex size-10 shrink-0 items-center justify-center rounded-[var(--radius)]">
          <MessageCircle className="size-5" aria-hidden />
        </span>
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="text-label text-ink font-semibold">
            {t("settings.integrations.whatsapp")}
          </span>
          <span className="text-caption text-muted">
            {t("settings.integrations.whatsappDescription")}
          </span>
        </div>
        <StatusPill tone="neutral" label={t("settings.integrations.notConnected")} />
      </div>

      <button
        type="button"
        disabled
        className="border-border-strong text-muted text-label h-10 cursor-not-allowed rounded-[var(--radius)] border font-medium opacity-60"
      >
        {t("settings.integrations.connect")}
      </button>
      <p className="text-caption text-faint">{t("settings.integrations.comingSoon")}</p>
    </Card>
  );
}

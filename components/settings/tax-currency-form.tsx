"use client";

// Settings › Tax & Currency (SPEC §4.4). Currency is fixed to LKR for this build
// (all money renders as LKR via lib/format — see the note), so it's shown
// read-only; editable here are the VAT rate (entered as a percent, stored as
// integer basis points — no float money, CLAUDE.md §3) and the registration
// status/number. Posts to the owner-only updateTaxConfig action.

import { useActionState, useState } from "react";
import { useTranslation } from "react-i18next";
import { updateTaxConfig, type SettingsActionState } from "@/app/(app)/settings/actions";
import { Card } from "@/components/ui/card";
import { bpsToPercentString, type TaxConfig } from "@/lib/settings/settings-config";

const FIELD_CLASS =
  "border-border text-label text-ink focus-visible:ring-brand/40 h-10 rounded-[var(--radius)] border bg-surface px-2 outline-none focus-visible:ring-2";

export function TaxCurrencyForm({ currency, tax }: { currency: string; tax: TaxConfig }) {
  const { t } = useTranslation();
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(
    updateTaxConfig,
    {},
  );
  const [registered, setRegistered] = useState(tax.registered);

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-h2 text-ink">{t("settings.tax.title")}</h2>

      <form action={action} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          {/* Currency: read-only for this build. */}
          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted">{t("settings.tax.currency")}</span>
            <input
              type="text"
              value={currency}
              readOnly
              disabled
              className={`${FIELD_CLASS} text-muted disabled:opacity-100`}
            />
            <span className="text-caption text-faint">{t("settings.tax.currencyFixed")}</span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted">{t("settings.tax.vatRate")}</span>
            <input
              type="number"
              name="vatRatePercent"
              inputMode="decimal"
              step="0.01"
              min="0"
              max="100"
              required
              defaultValue={bpsToPercentString(tax.vatRateBps)}
              className={`${FIELD_CLASS} tabular-nums`}
            />
          </label>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="registered"
            checked={registered}
            onChange={(e) => setRegistered(e.target.checked)}
            className="accent-brand size-4"
          />
          <span className="text-label text-ink">{t("settings.tax.registered")}</span>
        </label>

        {registered ? (
          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted">{t("settings.tax.taxId")}</span>
            <input
              type="text"
              name="taxId"
              maxLength={64}
              defaultValue={tax.taxId}
              className={FIELD_CLASS}
            />
          </label>
        ) : null}

        {state.ok ? <p className="text-caption text-success">{t("settings.tax.saved")}</p> : null}
        {state.error ? (
          <p role="alert" className="text-caption text-danger">
            {t(state.error)}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="bg-brand text-brand-white text-label hover:bg-brand-ember h-10 rounded-[var(--radius)] font-semibold transition-colors disabled:opacity-50"
        >
          {pending ? t("settings.tax.saving") : t("settings.tax.save")}
        </button>
      </form>
    </Card>
  );
}

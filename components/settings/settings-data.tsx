// Async server component: fetches the tenant's Settings view (business row, tax
// config, notification prefs, user roster, signed logo URL) and lays out every
// section. Rendered inside a Suspense boundary so the skeleton streams first
// (DESIGN.md §6). The per-user Language card (P14) also lives on this screen.

import { getSettings } from "@/lib/db/selectors/settings";
import { BusinessProfileForm } from "@/components/settings/business-profile-form";
import { TaxCurrencyForm } from "@/components/settings/tax-currency-form";
import { NotificationPreferencesForm } from "@/components/settings/notification-preferences";
import { LanguageSetting } from "@/components/settings/language-setting";
import { UserAccounts } from "@/components/settings/user-accounts";
import { WhatsAppIntegration } from "@/components/settings/whatsapp-integration";

export async function SettingsData() {
  const settings = await getSettings();

  return (
    <div className="flex flex-col gap-4">
      <BusinessProfileForm
        name={settings.business.name}
        address={settings.business.address}
        timezone={settings.business.timezone}
        localeDefault={settings.business.localeDefault}
        logoUrl={settings.business.logoUrl}
      />
      <TaxCurrencyForm currency={settings.business.currency} tax={settings.tax} />
      <NotificationPreferencesForm preferences={settings.notifications} />
      <LanguageSetting />
      <UserAccounts users={settings.users} />
      <WhatsAppIntegration />
    </div>
  );
}

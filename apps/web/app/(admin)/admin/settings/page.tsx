import { getPlatformSettings, toAdminSettingsDto } from "@xgamefi/shared";
import { AdminSettingsForm } from "./_components/admin-settings-form";

export default async function AdminSettings() {
  const s = toAdminSettingsDto(await getPlatformSettings());
  return (
    <section>
      <h1 className="font-display text-5xl mb-8">Platform Settings</h1>
      <AdminSettingsForm settings={s} />
    </section>
  );
}

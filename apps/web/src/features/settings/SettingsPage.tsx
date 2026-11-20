import { PageHeader } from '@/components/PageHeader';
import { PasswordSection, ProfileSection, ThemeSection, TimezoneSection } from './AccountSections';
import { ArchivedSection } from './ArchivedSection';
import { DangerZone } from './DangerZone';

/** `/settings` (plan 7.5). */
export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-6">
        <ProfileSection />
        <TimezoneSection />
        <PasswordSection />
        <ThemeSection />
        <ArchivedSection />
        <DangerZone />
      </div>
    </>
  );
}

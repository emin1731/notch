import { Globe, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useUpdateProfile } from '@/features/auth/hooks';
import { SETTINGS_COPY } from '@/features/settings/copy';
import { apiErrorMessage } from '@/lib/forms';
import { mismatchText, useTimezoneMismatch } from '@/lib/timezone';

/**
 * On a trip, Today would otherwise follow the account's timezone silently: offer the device's.
 * "Not now" is remembered for this device timezone.
 */
export function TimezoneBanner() {
  const { device, account, mismatch, dismissed, dismiss } = useTimezoneMismatch();
  const update = useUpdateProfile();
  if (!mismatch || dismissed) {
    return null;
  }
  return (
    <section
      aria-label="Timezone"
      className="flex flex-col gap-3 rounded-3xl bg-card p-5 text-sm sm:flex-row sm:items-center"
    >
      <Globe className="hidden size-5 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
      <span className="min-w-0 flex-1">{mismatchText(device, account)} Update?</span>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          disabled={update.isPending}
          onClick={() =>
            update.mutate(
              { timezone: device },
              {
                onSuccess: () => toast.success(SETTINGS_COPY.timezoneSaved(device)),
                onError: (error) => toast.error(apiErrorMessage(error)),
              },
            )
          }
        >
          Use {device}
        </Button>
        <Button variant="ghost" size="sm" onClick={dismiss}>
          <X />
          Not now
        </Button>
      </div>
    </section>
  );
}

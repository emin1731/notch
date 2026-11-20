import { LIMITS, milestoneTitleSchema } from '@notch/shared';
import { Plus, X } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

/** Milestones typed in one by one while creating a goal. */
export function MilestonesInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const full = value.length >= LIMITS.milestonesPerGoal;

  const add = () => {
    const parsed = milestoneTitleSchema.safeParse(draft);
    if (!parsed.success) {
      setError(draft.trim() ? (parsed.error.issues[0]?.message ?? null) : null);
      return;
    }
    onChange([...value, parsed.data]);
    setDraft('');
    setError(null);
  };

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={inputId}>Milestones (optional)</FieldLabel>
      {value.length > 0 && (
        <ol className="flex flex-col gap-1">
          {value.map((title, index) => (
            <li
              key={`${index}-${title}`}
              className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1 text-sm"
            >
              <span className="w-5 text-muted-foreground tabular-nums">{index + 1}.</span>
              <span className="min-w-0 flex-1 truncate">{title}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove milestone ${title}`}
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ol>
      )}
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={draft}
          disabled={full}
          placeholder={full ? 'Up to 50 milestones' : 'e.g. Run 10 km without stopping'}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={add} disabled={full || !draft.trim()}>
          <Plus />
          Add
        </Button>
      </div>
      <FieldDescription>Press Enter to add each one. You can change them later.</FieldDescription>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}

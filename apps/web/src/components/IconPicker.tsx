import type { CoreColor } from '@notch/shared';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { coreStyle } from '@/lib/core-colors';
import { searchCoreIcons } from '@/lib/core-icons';

/** A searchable grid of the curated core icons; arrow keys move between them. */
export function IconPicker({
  value,
  onChange,
  color,
  labelledBy,
}: {
  value: string;
  onChange: (icon: string) => void;
  color: CoreColor;
  labelledBy?: string;
}) {
  const [query, setQuery] = useState('');
  const searchId = useId();
  const results = searchCoreIcons(query);

  return (
    <div className="flex flex-col gap-2" style={coreStyle(color)}>
      <label htmlFor={searchId} className="sr-only">
        Search icons
      </label>
      <Input
        id={searchId}
        type="search"
        placeholder="Search icons, e.g. sleep"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <RadioGroupPrimitive.Root
        value={value}
        onValueChange={onChange}
        aria-labelledby={labelledBy}
        loop
        className="grid max-h-44 grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1 overflow-y-auto rounded-lg border p-1"
      >
        {results.map(({ name, label, icon: Icon }) => (
          <RadioGroupPrimitive.Item
            key={name}
            value={name}
            aria-label={label}
            title={label}
            className="flex aspect-square items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-(--core)/15 data-[state=checked]:text-(--core)"
          >
            <Icon className="size-5" aria-hidden="true" />
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>
      {results.length === 0 && (
        <p className="text-xs text-muted-foreground">No icon matches “{query}”.</p>
      )}
    </div>
  );
}

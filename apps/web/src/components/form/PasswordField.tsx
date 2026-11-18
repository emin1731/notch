import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import type { FieldValues } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { TextField, type TextFieldProps } from './TextField';

/** A password input with a show/hide toggle. */
export function PasswordField<T extends FieldValues>(props: Omit<TextFieldProps<T>, 'type'>) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onClick={() => setVisible((value) => !value)}
        >
          <Icon />
        </Button>
      }
    />
  );
}

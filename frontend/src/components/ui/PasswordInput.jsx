import { useState } from 'react';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { Input } from './Input';

/** Password field with a show/hide toggle. */
export function PasswordInput(props) {
  const [isVisible, setIsVisible] = useState(false);
  const Icon = isVisible ? EyeOff : Eye;

  return (
    <Input
      {...props}
      type={isVisible ? 'text' : 'password'}
      leftIcon={LockKeyhole}
      // Typed passwords should never be autocorrected or capitalised on phones.
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      rightElement={
        <button
          type="button"
          onClick={() => setIsVisible((visible) => !visible)}
          aria-label={isVisible ? 'Hide password' : 'Show password'}
          aria-pressed={isVisible}
          className="grid size-9 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-muted hover:text-ink"
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      }
    />
  );
}

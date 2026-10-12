import { Check } from 'lucide-react';
import { themeStyles } from '@/constants/profileThemes';
import { cn } from '@/utils/cn';

/** "Choose your campus style": a mini preview per style. Selecting one previews it at once. */
export function ThemePicker({ themes, value, onChange }) {
  return (
    <fieldset>
      <legend className="sr-only">Profile style</legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {themes.map((theme) => {
          const styles = themeStyles(theme.id);
          const isSelected = value === theme.id;
          return (
            <label
              key={theme.id}
              className={cn(
                'relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-surface transition-[border-color,box-shadow] duration-200',
                'has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-focus',
                isSelected ? 'border-primary shadow-soft ring-2 ring-primary' : 'border-line hover:border-line-strong',
              )}
            >
              <input
                type="radio"
                name="profileTheme"
                value={theme.id}
                checked={isSelected}
                onChange={() => onChange(theme.id)}
                className="sr-only"
              />
              <span className={cn('relative block h-14', styles.cover)} aria-hidden="true">
                <span className="absolute inset-0" style={styles.pattern} />
              </span>
              <span className={cn('relative -mt-4 ml-3 block size-8 rounded-full p-0.5', styles.ring)} aria-hidden="true">
                <span className="block size-full rounded-full border-2 border-surface bg-surface-muted" />
              </span>
              <span className="flex flex-1 flex-col px-3 pt-1.5 pb-3">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  {theme.name}
                  {isSelected && <Check className="size-4 text-primary" strokeWidth={3} aria-hidden="true" />}
                </span>
                <span className="mt-0.5 text-xs leading-snug text-ink-muted">{theme.description}</span>
                <span className="mt-2 flex gap-1" aria-hidden="true">
                  {['React', 'DSA'].map((sample) => (
                    <span key={sample} className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-semibold', styles.chip)}>
                      {sample}
                    </span>
                  ))}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

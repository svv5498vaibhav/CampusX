import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { ErrorState, Loader } from '@/components/ui';
import { useNotificationStore } from '@/store/notificationStore';
import { toast } from '@/store/toastStore';
import { cn } from '@/utils/cn';

function Switch({ checked, disabled, onChange, labelledBy, describedBy }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed',
        checked ? 'bg-primary' : 'bg-line-strong',
        disabled && 'opacity-60',
      )}
    >
      <span className={cn('inline-block size-5 rounded-full bg-white shadow-soft transition-transform', checked ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  );
}

/** Which kinds of notifications the student wants. CampusX updates always stay on. */
export function NotificationPreferences() {
  const preferences = useNotificationStore((state) => state.preferences);
  const categories = useNotificationStore((state) => state.categories);
  const status = useNotificationStore((state) => state.preferencesStatus);
  const { fetchPreferences, updatePreference } = useNotificationStore.getState();
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    fetchPreferences();
  }, []);

  const change = async (category, enabled) => {
    setSaving(category.id);
    try {
      await updatePreference(category.id, enabled);
      toast.success(`${category.label} notifications ${enabled ? 'on' : 'off'}`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(null);
    }
  };

  if (status === 'loading') return <Loader centered label="Loading your notification settings" className="min-h-40" />;
  if (status === 'error') return <ErrorState title="Couldn't load your settings" onRetry={fetchPreferences} className="py-6" />;
  if (!preferences) return null;

  return (
    <ul className="flex flex-col divide-y divide-line">
      {categories.map((category) => (
        <li key={category.id} className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <p id={`pref-${category.id}`} className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              {category.label}
              {category.locked && <Lock className="size-3.5 text-ink-subtle" aria-hidden="true" />}
            </p>
            <p id={`pref-${category.id}-hint`} className="text-xs text-ink-muted">
              {category.description}
              {category.locked && ' · Always on'}
            </p>
          </div>
          <Switch
            checked={Boolean(preferences[category.id])}
            disabled={category.locked || saving === category.id}
            onChange={(enabled) => change(category, enabled)}
            labelledBy={`pref-${category.id}`}
            describedBy={`pref-${category.id}-hint`}
          />
        </li>
      ))}
    </ul>
  );
}

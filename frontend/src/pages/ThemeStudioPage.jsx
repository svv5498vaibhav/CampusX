import { useEffect, useState } from 'react';
import { Check, Monitor, Palette, RotateCcw, ShieldHalf, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { PageContainer } from '@/components/layout/PageContainer';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { AdminThemePreview, AppThemePreview } from '@/components/theme/ThemePreview';
import { ThemeOptionCard } from '@/components/theme/ThemeOptionCard';
import { Button, Card } from '@/components/ui';
import { ADMIN_THEMES, APP_THEMES, DEFAULT_ADMIN_MODE, DEFAULT_APPEARANCE, themeId } from '@/constants/appThemes';
import { ROLES } from '@/constants/auth';
import { ROUTES } from '@/constants/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { toast } from '@/store/toastStore';
import { cn } from '@/utils/cn';

const DEFAULTS = { ...DEFAULT_APPEARANCE, adminMode: DEFAULT_ADMIN_MODE };
const same = (a, b) => a.style === b.style && a.theme === b.theme && a.adminMode === b.adminMode;

/**
 * /theme-studio: choose the app's look. Picking a theme previews it across the whole app at once; Apply
 * saves it on this device, Cancel (or leaving the page) goes back to the saved one, Reset picks the
 * defaults. Staff also choose the admin control center's variant here; it never changes the student app.
 */
export default function ThemeStudioPage() {
  useDocumentTitle('Theme Studio');
  const savedStyle = useThemeStore((state) => state.style);
  const savedTheme = useThemeStore((state) => state.theme);
  const savedAdminMode = useThemeStore((state) => state.adminMode);
  const applyAppearance = useThemeStore((state) => state.applyAppearance);
  const isStaff = useAuthStore((state) => [ROLES.ADMIN, ROLES.MODERATOR].includes(state.user?.role));
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');

  const saved = { style: savedStyle, theme: savedTheme, adminMode: savedAdminMode };
  const [draft, setDraft] = useState(saved);

  // A theme saved elsewhere (the sidebar toggle, another tab) becomes the starting point again.
  useEffect(() => setDraft({ style: savedStyle, theme: savedTheme, adminMode: savedAdminMode }), [savedStyle, savedTheme, savedAdminMode]);

  // Live preview of the student theme while it differs from the saved one.
  useEffect(() => {
    const changed = draft.style !== savedStyle || draft.theme !== savedTheme;
    useThemeStore.getState().setPreview(changed ? { style: draft.style, theme: draft.theme } : null);
  }, [draft.style, draft.theme, savedStyle, savedTheme]);
  // Leaving without applying shows the saved theme again.
  useEffect(() => () => useThemeStore.getState().setPreview(null), []);

  const deviceMode = systemDark ? 'dark' : 'light';
  const followDevice = draft.theme === 'system';
  const shownMode = followDevice ? deviceMode : draft.theme;
  const savedMode = savedTheme === 'system' ? deviceMode : savedTheme;
  const dirty = !same(draft, saved);
  const selectedName = APP_THEMES.find((theme) => theme.id === themeId(draft.style, shownMode))?.name;

  const selectTheme = (id) => {
    const theme = APP_THEMES.find((item) => item.id === id);
    // With "match my device" on, the variant the device is showing keeps following it; the other one is an explicit choice.
    setDraft((current) => ({ ...current, style: theme.style, theme: current.theme === 'system' && theme.mode === deviceMode ? 'system' : theme.mode }));
  };
  const setFollowDevice = (on) => setDraft((current) => ({ ...current, theme: on ? 'system' : deviceMode }));

  const apply = () => {
    applyAppearance(draft);
    toast.success(`${selectedName} applied`);
  };

  return (
    <PageContainer>
      <SectionHeader
        as="h1"
        eyebrow="Settings"
        title="Theme Studio"
        description="Pick how CampusX looks on this device. Your choice previews across the whole app right away; apply it to keep it."
      />

      <div className="mt-6 flex flex-col gap-6">
        <Card>
          <fieldset>
            <legend className="flex items-center gap-2 font-display text-lg font-bold text-ink">
              <Palette className="size-5 text-primary" aria-hidden="true" /> App theme
            </legend>
            <p className="mt-1 text-sm text-ink-muted">Every page, card, menu and dialog follows it. Your profile style is separate and sits on top.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {APP_THEMES.map((theme) => (
                <ThemeOptionCard
                  key={theme.id}
                  group="app-theme"
                  value={theme.id}
                  checked={draft.style === theme.style && shownMode === theme.mode}
                  onSelect={selectTheme}
                  title={theme.name}
                  description={theme.description}
                  inUse={savedStyle === theme.style && savedMode === theme.mode}
                  preview={<AppThemePreview theme={theme} />}
                />
              ))}
            </div>
          </fieldset>

          <label className="mt-4 flex cursor-pointer items-center gap-4 rounded-2xl border border-line bg-surface-muted px-4 py-3 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-focus">
            <Monitor className="size-5 shrink-0 text-ink-muted" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Match my device</span>
              <span className="block text-xs text-ink-muted">Switch between light and dark when your device does (it’s {deviceMode} right now).</span>
            </span>
            <input type="checkbox" role="switch" checked={followDevice} onChange={(event) => setFollowDevice(event.target.checked)} className="sr-only" />
            <span aria-hidden="true" className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200', followDevice ? 'bg-primary' : 'bg-line-strong')}>
              <span className={cn('absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-campus', followDevice && 'translate-x-5')} />
            </span>
          </label>
        </Card>

        {isStaff && (
          <Card>
            <fieldset>
              <legend className="flex items-center gap-2 font-display text-lg font-bold text-ink">
                <ShieldHalf className="size-5 text-primary" aria-hidden="true" /> Admin control center
              </legend>
              <p className="mt-1 text-sm text-ink-muted">Used only inside the control center, which always has the Aurora Glass look. It doesn’t change your app theme.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {ADMIN_THEMES.map((theme) => (
                  <ThemeOptionCard
                    key={theme.id}
                    group="admin-theme"
                    value={theme.mode}
                    checked={draft.adminMode === theme.mode}
                    onSelect={(mode) => setDraft((current) => ({ ...current, adminMode: mode }))}
                    title={theme.name}
                    description={theme.description}
                    inUse={savedAdminMode === theme.mode}
                    preview={<AdminThemePreview theme={theme} />}
                  />
                ))}
              </div>
            </fieldset>
          </Card>
        )}

        <p className="flex items-start gap-2 px-1 text-sm text-ink-muted">
          <UserRound className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Looking for your profile’s look?{' '}
            <Link to={`${ROUTES.PROFILE_EDIT}#style`} className="font-semibold text-primary hover:underline">
              Choose a profile style
            </Link>{' '}
            when you edit your profile.
          </span>
        </p>

        {/* Actions stay within reach while scrolling (above the phone tab bar). */}
        <div className="glass-overlay sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-overlay/95 p-3 shadow-lift backdrop-blur-md md:bottom-4">
          <p role="status" className="min-w-0 flex-1 basis-full text-sm text-ink-muted sm:basis-auto">
            {dirty ? (
              <>
                Previewing <span className="font-semibold text-ink">{selectedName}</span>
                {draft.adminMode !== savedAdminMode && ' and a new control center theme'}. Not saved yet.
              </>
            ) : (
              'Saved on this device.'
            )}
          </p>
          <Button variant="ghost" size="sm" leftIcon={RotateCcw} onClick={() => setDraft(DEFAULTS)} disabled={same(draft, DEFAULTS)}>
            Reset
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDraft(saved)} disabled={!dirty}>
            Cancel
          </Button>
          <Button size="sm" leftIcon={Check} onClick={apply} disabled={!dirty}>
            Apply
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}

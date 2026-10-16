import { memo, useDeferredValue, useMemo } from 'react';
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { cn } from '@/utils/cn';
import { accentMap } from '@/hooks/useResumeDownload';
import { layoutResume } from '@/utils/resume/document';
import { DEFAULT_SECTION_TITLES, SECTION_HAS_CONTENT, sectionTitle } from '@/utils/resume/format';
import { move } from '@/utils/resume/content';
import { ResumePage } from '../ResumePage';
import { IconButton, StepIntro, SubSection } from '../ResumeFields';

/** Settings a template offers, keeping the student's choices where the template has them. */
export function settingsForTemplate(template, settings) {
  return {
    accent: template.accents.includes(settings.accent) ? settings.accent : template.accents[0],
    font: template.fonts.includes(settings.font) ? settings.font : template.fonts[0],
    density: template.density,
    pageMode: template.pageMode,
  };
}

const Thumbnail = memo(function Thumbnail({ resume, template, accents }) {
  const layout = useMemo(() => layoutResume({ ...resume, template: template.id, settings: settingsForTemplate(template, resume.settings), sections: { ...resume.sections, order: resume.sections.customOrder ? resume.sections.order : template.order } }, { accents }), [resume, template, accents]);
  return <ResumePage page={layout.pages[0]} label={`${template.name} preview`} className="block h-auto w-full" />;
});

/** Step 9: template, colour, font, spacing, page mode, and the order and visibility of sections. */
export function DesignStep({ editor, options, layout }) {
  const { draft, change } = editor;
  const accents = useMemo(() => accentMap(options), [options]);
  const deferred = useDeferredValue(draft);
  const preview = useMemo(() => ({ template: deferred.template, settings: deferred.settings, sections: deferred.sections, content: deferred.content }), [deferred]);
  const template = options.templates.find((item) => item.id === draft.template) ?? options.templates[0];
  const { settings, sections } = draft;

  const chooseTemplate = (next) =>
    change((current) => ({
      ...current,
      template: next.id,
      settings: settingsForTemplate(next, current.settings),
      sections: current.sections.customOrder ? current.sections : { ...current.sections, order: next.order },
    }));
  const setSetting = (key, value) => change((current) => ({ ...current, settings: { ...current.settings, [key]: value } }));
  const setSections = (patch) => change((current) => ({ ...current, sections: { ...current.sections, ...patch } }));
  const setTitle = (key, value) =>
    change((current) => {
      if (key.startsWith('custom-')) {
        const index = Number(key.slice(7)) - 1;
        if (!current.content.custom[index]) return current;
        return { ...current, content: { ...current.content, custom: current.content.custom.map((item, position) => (position === index ? { ...item, title: value } : item)) } };
      }
      const titles = { ...current.sections.titles };
      if (value.trim()) titles[key] = value;
      else delete titles[key];
      return { ...current, sections: { ...current.sections, titles } };
    });

  return (
    <div className="flex flex-col gap-8">
      <StepIntro title="Template & style" description="Switch templates freely: your content stays exactly as it is. Every template downloads as a real, text-based A4 PDF." />

      {options.categories.map((category) => (
        <SubSection key={category.id} id={`templates-${category.id}`} title={category.id === 'fresher' ? 'Choose Fresher Template' : category.label} description={category.description}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-3" role="radiogroup" aria-label={category.label}>
            {options.templates
              .filter((item) => item.category === category.id)
              .map((item) => {
                const selected = item.id === draft.template;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => chooseTemplate(item)}
                    data-template={item.id}
                    className={cn('group flex flex-col overflow-hidden rounded-2xl border bg-surface text-left transition-[border-color,box-shadow] hover:shadow-soft', selected ? 'border-primary ring-2 ring-primary' : 'border-line hover:border-line-strong')}
                  >
                    <span className="relative block border-b border-line bg-surface-muted p-2">
                      <span className="block overflow-hidden rounded-sm shadow-soft">
                        <Thumbnail resume={preview} template={item} accents={accents} />
                      </span>
                      {selected && (
                        <span className="absolute top-3 right-3 grid size-6 place-items-center rounded-full bg-primary text-primary-fg shadow-soft" aria-hidden="true">
                          <Check className="size-3.5" />
                        </span>
                      )}
                    </span>
                    <span className="flex flex-1 flex-col gap-1 p-3">
                      <span className="text-sm font-bold text-ink">{item.name}</span>
                      <span className="text-xs leading-snug text-ink-muted">{item.layout}</span>
                      {item.ats && <Badge variant="primary" className="mt-1 self-start">Single column · text only</Badge>}
                    </span>
                  </button>
                );
              })}
          </div>
        </SubSection>
      ))}

      <SubSection id="template-about" title={template.name} description={template.description}>
        <p className="text-sm text-ink-muted">
          <span className="font-semibold text-ink">Best for: </span>
          {template.bestFor}
        </p>
        {template.accents.length > 1 && (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">Accent colour</legend>
            <div className="flex flex-wrap gap-2">
              {template.accents.map((id) => {
                const accent = options.accents.find((item) => item.id === id);
                const selected = settings.accent === id;
                return (
                  <label key={id} className={cn('inline-flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs font-semibold has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-focus', selected ? 'border-primary bg-primary-soft text-primary-soft-fg' : 'border-line text-ink')}>
                    <input type="radio" name="resume-accent" className="sr-only" checked={selected} onChange={() => setSetting('accent', id)} />
                    <span className="size-4 rounded-full ring-1 ring-black/10" style={{ backgroundColor: accent?.hex }} aria-hidden="true" />
                    {accent?.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Choice label="Font" name="resume-font" value={settings.font} options={options.fonts.filter((font) => template.fonts.includes(font.id))} onChange={(value) => setSetting('font', value)} />
          <Choice label="Spacing" name="resume-density" value={settings.density} options={options.densities} onChange={(value) => setSetting('density', value)} />
          <Choice label="Pages" name="resume-pages" value={settings.pageMode} options={options.pageModes} onChange={(value) => setSetting('pageMode', value)} />
        </div>
        {layout && (
          <p className="text-sm text-ink-muted" aria-live="polite">
            Currently {layout.pageCount} {layout.pageCount === 1 ? 'page' : 'pages'}
            {settings.pageMode === 'one' && !layout.fitted ? ': too much content for one page, so nothing was cut and it continues on page 2.' : '.'}
          </p>
        )}
      </SubSection>

      <SubSection id="sections-order" title="Sections" description="Reorder, rename or hide sections. Empty sections never appear on the resume.">
        <ol className="flex flex-col gap-2" data-testid="section-order">
          {sections.order.map((key, index) => {
            const hidden = sections.hidden.includes(key);
            const empty = !SECTION_HAS_CONTENT[key]?.(draft.content);
            const isCustom = key.startsWith('custom-');
            const customMissing = isCustom && !draft.content.custom[Number(key.slice(7)) - 1];
            const title = sectionTitle(key, draft);
            return (
              <li key={key} className={cn('flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-2 py-1.5', hidden && 'opacity-60')} data-section={key}>
                <div className="flex">
                  <IconButton label={`Move ${title} up`} icon={ArrowUp} disabled={index === 0} onClick={() => setSections({ order: move(sections.order, index, index - 1), customOrder: true })} />
                  <IconButton label={`Move ${title} down`} icon={ArrowDown} disabled={index === sections.order.length - 1} onClick={() => setSections({ order: move(sections.order, index, index + 1), customOrder: true })} />
                </div>
                <input
                  aria-label={`Title for ${DEFAULT_SECTION_TITLES[key]}`}
                  value={isCustom ? (draft.content.custom[Number(key.slice(7)) - 1]?.title ?? '') : (sections.titles[key] ?? '')}
                  placeholder={isCustom && customMissing ? 'Add it in Experience & more' : DEFAULT_SECTION_TITLES[key]}
                  disabled={customMissing}
                  maxLength={40}
                  onChange={(event) => setTitle(key, event.target.value)}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-sm font-semibold text-ink placeholder:font-normal placeholder:text-ink-subtle hover:border-line focus:border-primary focus:ring-4 focus:ring-focus focus:outline-none disabled:cursor-not-allowed"
                />
                {empty && !customMissing && <Badge variant="neutral">Empty</Badge>}
                <button
                  type="button"
                  aria-pressed={!hidden}
                  onClick={() => setSections({ hidden: hidden ? sections.hidden.filter((item) => item !== key) : [...sections.hidden, key] })}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-ink-muted hover:bg-surface-muted hover:text-ink"
                  aria-label={`${hidden ? 'Show' : 'Hide'} ${title}`}
                >
                  {hidden ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                  {hidden ? 'Hidden' : 'Shown'}
                </button>
              </li>
            );
          })}
        </ol>
        {sections.customOrder && (
          <Button variant="ghost" size="sm" leftIcon={RotateCcw} className="self-start" onClick={() => setSections({ order: template.order, customOrder: false })}>
            Reset to the template’s order
          </Button>
        )}
      </SubSection>
    </div>
  );
}

function Choice({ label, name, value, options, onChange }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-ink">{label}</legend>
      <div className="flex flex-col gap-1.5">
        {options.map((option) => (
          <label key={option.id} className={cn('flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-focus', value === option.id ? 'border-primary bg-primary-soft font-semibold text-primary-soft-fg' : 'border-line text-ink hover:border-line-strong')}>
            <input type="radio" name={name} className="sr-only" checked={value === option.id} onChange={() => onChange(option.id)} />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/utils/cn';
import { ResumePage } from './ResumePage';

const ZOOMS = [60, 75, 90, 100, 125, 150];

/**
 * The live A4 preview: every page of the laid-out resume, at the width of the panel (or zoomed), with page
 * numbers and a note when "fit on one page" couldn't fit everything.
 */
export function ResumePreview({ layout, pageMode, className, compact = false }) {
  const [zoom, setZoom] = useState(100);
  const index = ZOOMS.indexOf(zoom);
  const pages = layout?.pages ?? [];
  return (
    <div className={cn('flex flex-col', className)} data-testid="resume-preview" data-page-count={pages.length}>
      {!compact && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink" aria-live="polite">
            A4 preview · {pages.length} {pages.length === 1 ? 'page' : 'pages'}
          </p>
          <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1" role="group" aria-label="Preview zoom">
            <button type="button" className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted disabled:opacity-40" onClick={() => setZoom(ZOOMS[index - 1])} disabled={index <= 0} aria-label="Zoom out">
              <Minus className="size-4" aria-hidden="true" />
            </button>
            <span className="w-12 text-center text-xs font-semibold text-ink-muted tabular-nums">{zoom}%</span>
            <button type="button" className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted disabled:opacity-40" onClick={() => setZoom(ZOOMS[index + 1])} disabled={index >= ZOOMS.length - 1} aria-label="Zoom in">
              <Plus className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      {pageMode === 'one' && layout && !layout.fitted && (
        <p className="mb-3 rounded-xl bg-accent-soft px-3 py-2 text-xs font-medium text-accent-fg" role="status">
          This doesn’t fit on one page even at the most compact size, so it continues on page 2. Hide a section or shorten some points to bring it to one page.
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto rounded-2xl bg-surface-muted p-3 sm:p-4" tabIndex={0} aria-label="Resume preview pages">
        <div className="mx-auto flex flex-col gap-4" style={{ width: `${zoom}%`, minWidth: zoom > 100 ? `${zoom}%` : undefined }}>
          {pages.map((page, pageIndex) => (
            // Pages have no identity beyond their position.
            <div key={pageIndex} className="relative" data-resume-page={pageIndex + 1}>
              <ResumePage page={page} label={`Resume page ${pageIndex + 1} of ${pages.length}`} className="block h-auto w-full rounded-sm shadow-lift ring-1 ring-black/5" />
              {pages.length > 1 && <span className="pointer-events-none absolute right-2 bottom-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">{pageIndex + 1}/{pages.length}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

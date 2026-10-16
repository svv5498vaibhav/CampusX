import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ResumePage } from './ResumePage';

/**
 * Printing: the laid-out pages, each on its own A4 sheet with no browser margins. The pages sit in a
 * container that only shows while printing (styles/index.css, "Resume printing"), so the browser's print
 * dialog gets the resume and nothing else of the app. Call `print()` from the returned controls.
 */
export function useResumePrint() {
  const [pages, setPages] = useState(null);

  useEffect(() => {
    if (!pages) return undefined;
    const done = () => {
      document.documentElement.classList.remove('printing-resume');
      setPages(null);
    };
    document.documentElement.classList.add('printing-resume');
    window.addEventListener('afterprint', done, { once: true });
    // Let React draw the pages first.
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
      document.documentElement.classList.remove('printing-resume');
    };
  }, [pages]);

  const portal = pages
    ? createPortal(
        <div className="resume-print-root" aria-hidden="true">
          {pages.map((page, index) => (
            <ResumePage key={index} page={page} label={`Page ${index + 1}`} className="resume-print-page" />
          ))}
        </div>,
        document.body,
      )
    : null;

  return { print: (layout) => setPages(layout?.pages ?? null), portal };
}

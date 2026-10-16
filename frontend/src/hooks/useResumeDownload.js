import { useCallback, useState } from 'react';
import { resumeApi } from '@/services/resumeApi';
import { useResumeStore } from '@/store/resumeStore';
import { toast } from '@/store/toastStore';
import { layoutResume } from '@/utils/resume/document';
import { resumePdf, saveBlob } from '@/utils/resume/pdf';

export const accentMap = (options) => Object.fromEntries((options?.accents ?? []).map((accent) => [accent.id, accent.hex]));

/**
 * "Download PDF": saves pending edits (when `beforeExport` is given), fetches the saved, owner-checked copy
 * from the server, lays it out exactly like the preview and writes the PDF in the browser.
 * state: 'idle' | 'preparing' | 'done' | 'error'
 */
export function useResumeDownload() {
  const [state, setState] = useState('idle');
  const download = useCallback(async (resumeId, { beforeExport } = {}) => {
    setState('preparing');
    const toastId = toast.loading('Preparing your PDF…');
    try {
      if (beforeExport && !(await beforeExport())) {
        throw new Error('Your latest changes couldn’t be saved, so the PDF wasn’t made. Fix the problem shown at the top of the editor and try again.');
      }
      const [resume, options] = await Promise.all([resumeApi.export(resumeId), useResumeStore.getState().loadOptions()]);
      const layout = layoutResume(resume, { accents: accentMap(options) });
      const { blob, fileName } = resumePdf(layout, resume);
      saveBlob(blob, fileName);
      useResumeStore.getState().upsert(resume);
      toast.success(`Downloaded ${fileName} (${layout.pageCount} ${layout.pageCount === 1 ? 'page' : 'pages'})`, { id: toastId });
      setState('done');
      return true;
    } catch (error) {
      toast.error(`Couldn’t make the PDF. ${error.message}`, { id: toastId });
      setState('error');
      return false;
    }
  }, []);
  return { download, state, preparing: state === 'preparing' };
}

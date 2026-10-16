import { useCallback, useEffect, useRef, useState } from 'react';
import { AUTOSAVE_DELAY_MS } from '@/constants/resume';
import { resumeApi } from '@/services/resumeApi';
import { useResumeStore } from '@/store/resumeStore';

const EDITABLE = ['name', 'targetRole', 'customRole', 'template', 'settings', 'sections', 'content'];
const draftOf = (resume) => Object.fromEntries(EDITABLE.map((key) => [key, structuredClone(resume[key])]));

/** The top-level fields of `draft` that differ from `saved`. */
function changesBetween(draft, saved) {
  const changes = {};
  for (const key of EDITABLE) if (JSON.stringify(draft[key]) !== JSON.stringify(saved[key])) changes[key] = draft[key];
  return changes;
}

/**
 * One resume in the editor: the saved copy, the student's working draft, and autosave. Changes are saved
 * a moment after the student stops typing (and right away before a download, a check or leaving), with
 * the revision they were based on, so a change made in another tab is reported instead of overwritten.
 *
 * saveState: 'saved' | 'dirty' | 'saving' | 'error' | 'conflict'; save() saves now and resolves true when saved.
 */
export function useResumeEditor(resumeId) {
  const [state, setState] = useState({ status: 'loading', error: null, errorStatus: 0, resume: null, draft: null, saveState: 'saved', saveError: null, fieldErrors: [] });
  const draftRef = useRef(null);
  const savedRef = useRef(null);
  const revisionRef = useRef(0);
  const timerRef = useRef(null);
  const inFlightRef = useRef(null);
  const blockedRef = useRef(false);
  const importedRef = useRef(false);

  const load = useCallback(async () => {
    clearTimeout(timerRef.current);
    setState((current) => ({ ...current, status: 'loading', error: null }));
    try {
      const resume = await resumeApi.get(resumeId);
      const draft = draftOf(resume);
      draftRef.current = draft;
      savedRef.current = draftOf(resume);
      revisionRef.current = resume.revision;
      blockedRef.current = false;
      setState({ status: 'ready', error: null, errorStatus: 0, resume, draft, saveState: 'saved', saveError: null, fieldErrors: [] });
    } catch (error) {
      setState((current) => ({ ...current, status: 'error', error: error.message, errorStatus: error.status }));
    }
  }, [resumeId]);

  useEffect(() => {
    load();
    return () => clearTimeout(timerRef.current);
  }, [load]);

  const save = useCallback(async () => {
    clearTimeout(timerRef.current);
    if (blockedRef.current || !draftRef.current) return false;
    // A save already running may not hold the latest edits: wait for it, then save what is left.
    if (inFlightRef.current) {
      await inFlightRef.current;
      return save();
    }
    const draft = draftRef.current;
    const changes = changesBetween(draft, savedRef.current);
    if (!Object.keys(changes).length) {
      setState((current) => (current.saveState === 'saved' ? current : { ...current, saveState: 'saved', saveError: null }));
      return true;
    }
    setState((current) => ({ ...current, saveState: 'saving' }));
    const request = (async () => {
      try {
        const imported = importedRef.current;
        const resume = await resumeApi.update(resumeId, { ...changes, revision: revisionRef.current, ...(imported && { markImported: true }) });
        if (imported) importedRef.current = false;
        revisionRef.current = resume.revision;
        // A new template can bring its own colours and section order: take the server's choice unless
        // the student has changed them again since.
        const saved = { ...draft, settings: resume.settings, sections: resume.sections };
        savedRef.current = saved;
        const untouched = draftRef.current === draft;
        if (untouched) draftRef.current = saved;
        setState((current) => ({ ...current, resume, draft: untouched ? saved : current.draft, saveState: untouched ? 'saved' : 'dirty', saveError: null, fieldErrors: [] }));
        useResumeStore.getState().upsert(resume);
        return true;
      } catch (error) {
        if (error.status === 409 && error.errors?.some((item) => item.field === 'revision')) {
          blockedRef.current = true;
          setState((current) => ({ ...current, saveState: 'conflict', saveError: error.message }));
        } else {
          setState((current) => ({ ...current, saveState: 'error', saveError: error.message, fieldErrors: error.status === 422 || error.status === 409 ? error.errors ?? [] : [] }));
        }
        return false;
      } finally {
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = request;
    return request;
  }, [resumeId]);

  /** Applies `updater(draft) → draft` and schedules a save. */
  const change = useCallback(
    (updater) => {
      const next = updater(draftRef.current);
      if (next === draftRef.current) return;
      draftRef.current = next;
      setState((current) => ({ ...current, draft: next, saveState: current.saveState === 'conflict' ? 'conflict' : 'dirty' }));
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => save(), AUTOSAVE_DELAY_MS);
    },
    [save],
  );

  const setContent = useCallback((updater) => change((draft) => ({ ...draft, content: updater(draft.content) })), [change]);
  const setField = useCallback((key, value) => change((draft) => ({ ...draft, [key]: value })), [change]);

  // Warn before closing the tab with unsaved changes; save when the tab is hidden.
  useEffect(() => {
    const pending = () => draftRef.current && savedRef.current && Object.keys(changesBetween(draftRef.current, savedRef.current)).length > 0;
    const beforeUnload = (event) => {
      if (!pending()) return;
      save();
      event.preventDefault();
      event.returnValue = '';
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden' && pending()) save();
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [save]);

  // Leaving the editor inside the app: save what is pending.
  useEffect(() => () => {
    if (draftRef.current && savedRef.current && !blockedRef.current && Object.keys(changesBetween(draftRef.current, savedRef.current)).length) save();
  }, [save]);

  /** Records (with the next save) that the student imported their CampusX profile. */
  const markImported = useCallback(() => {
    importedRef.current = true;
  }, []);

  return { ...state, change, setContent, setField, save, reload: load, markImported };
}

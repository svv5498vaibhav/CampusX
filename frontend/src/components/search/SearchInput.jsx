import { useEffect, useId, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { SearchSuggestions, suggestionOptionId } from '@/components/search/SearchSuggestions';
import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH, SUGGESTION_DEBOUNCE_MS } from '@/constants/search';
import { useSearchStore } from '@/store/searchStore';
import { cn } from '@/utils/cn';

const RECENT_SHOWN = 6;
const SIZES = {
  md: { field: 'h-11 rounded-xl pl-10 pr-10 text-sm', icon: 'left-3.5 size-4', clear: 'right-1.5 size-8' },
  lg: { field: 'h-13 rounded-2xl pl-12 pr-12 text-base', icon: 'left-4 size-5', clear: 'right-2 size-9' },
};

/**
 * The CampusX search box: a combobox with suggestions as the student types (debounced, never a request
 * per keystroke) and recent searches while it is empty.
 *   ↓ / ↑ move through suggestions · Enter opens the highlighted one, or searches the text · Esc closes
 * `onSubmit(text)` runs a search; `onSelect(item)` opens a suggestion or recent search. `popupWidth` lets the
 * narrow sidebar box open a wider list.
 */
export function SearchInput({ value, onValueChange, onSubmit, onSelect, size = 'md', placeholder = 'Search CampusX', autoFocus = false, showRecent = true, className, popupWidth = 'w-full' }) {
  const listId = useId();
  const hintId = useId();
  const timer = useRef(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hint, setHint] = useState('');
  const suggestions = useSearchStore((state) => state.suggestions);
  const suggestionsFor = useSearchStore((state) => state.suggestionsFor);
  const suggestionsStatus = useSearchStore((state) => state.suggestionsStatus);
  const history = useSearchStore((state) => state.history);
  const { fetchSuggestions, clearSuggestions, fetchHistory } = useSearchStore.getState();
  const styles = SIZES[size];

  const text = value.replace(/\s+/g, ' ').trim();
  const typing = text.length >= MIN_QUERY_LENGTH;
  // Suggestions for older text are kept on screen until the new ones arrive (no flicker while typing).
  const items = typing
    ? suggestionsFor && text.toLowerCase().startsWith(suggestionsFor.toLowerCase().slice(0, MIN_QUERY_LENGTH)) ? suggestions : []
    : showRecent && !text
      ? history.slice(0, RECENT_SHOWN).map((entry) => ({ kind: 'recent', id: entry.id, label: entry.query, query: entry.query }))
      : [];
  const expanded = open && items.length > 0;

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => setActiveIndex(-1), [suggestionsFor, typing]);

  const change = (next) => {
    onValueChange(next.slice(0, MAX_QUERY_LENGTH));
    setOpen(true);
    setHint('');
    clearTimeout(timer.current);
    const trimmed = next.replace(/\s+/g, ' ').trim();
    if (trimmed.length < MIN_QUERY_LENGTH) clearSuggestions();
    else timer.current = setTimeout(() => fetchSuggestions(trimmed), SUGGESTION_DEBOUNCE_MS);
  };

  const close = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const choose = (item) => {
    close();
    clearTimeout(timer.current);
    onSelect(item);
  };

  const submit = (event) => {
    event.preventDefault();
    if (expanded && activeIndex >= 0) return choose(items[activeIndex]);
    if (text.length < MIN_QUERY_LENGTH) {
      setHint(`Type at least ${MIN_QUERY_LENGTH} characters to search.`);
      return undefined;
    }
    close();
    clearTimeout(timer.current);
    return onSubmit(text);
  };

  const keyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (items.length === 0) return;
      event.preventDefault();
      setOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      // Wraps through "no option highlighted" (-1), so Enter can still search the typed text.
      setActiveIndex((index) => {
        const next = index + step;
        if (next >= items.length) return -1;
        if (next < -1) return items.length - 1;
        return next;
      });
    } else if (event.key === 'Escape') {
      if (expanded) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    }
  };

  return (
    <form role="search" onSubmit={submit} className={cn('relative', className)} noValidate>
      <div className="relative">
        <Search className={cn('pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle', styles.icon)} aria-hidden="true" />
        <input
          type="search"
          role="combobox"
          aria-label="Search CampusX"
          aria-expanded={expanded}
          aria-controls={expanded ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={expanded && activeIndex >= 0 ? suggestionOptionId(listId, activeIndex) : undefined}
          aria-describedby={hint ? hintId : undefined}
          aria-invalid={hint ? true : undefined}
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          maxLength={MAX_QUERY_LENGTH}
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={value}
          onChange={(event) => change(event.target.value)}
          onFocus={() => {
            setOpen(true);
            if (showRecent) fetchHistory();
          }}
          onBlur={close}
          onKeyDown={keyDown}
          className={cn(
            'w-full border border-line-strong bg-surface text-ink placeholder:text-ink-subtle transition-[border-color,box-shadow] focus:border-primary focus:ring-4 focus:ring-focus focus:outline-none [&::-webkit-search-cancel-button]:hidden',
            styles.field,
          )}
        />
        {value && (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => change('')}
            aria-label="Clear search text"
            className={cn('absolute top-1/2 grid -translate-y-1/2 place-items-center rounded-lg text-ink-subtle hover:bg-surface-muted hover:text-ink', styles.clear)}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {hint && (
        <p id={hintId} role="alert" className="mt-1.5 px-1 text-xs font-semibold text-danger-fg">
          {hint}
        </p>
      )}
      {expanded && (
        <SearchSuggestions
          id={listId}
          items={items}
          activeIndex={activeIndex}
          onSelect={choose}
          onHover={setActiveIndex}
          heading={typing ? null : 'Recent searches'}
          loading={typing && suggestionsStatus === 'loading'}
          className={cn('absolute top-full z-40 mt-2', popupWidth)}
        />
      )}
    </form>
  );
}

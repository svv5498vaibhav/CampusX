import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui';

/** Search box for opportunities. Waits for a short pause in typing before searching. */
export function OpportunitySearch({ value, onSearch, placeholder = 'Search opportunities...' }) {
  const [draft, setDraft] = useState(value);
  const timer = useRef(null);

  // Follow outside changes (e.g. "Clear filters" or the back button).
  useEffect(() => setDraft(value), [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const change = (text) => {
    setDraft(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearch(text.trim()), 300);
  };

  return (
    <Input
      type="search"
      aria-label="Search opportunities"
      placeholder={placeholder}
      leftIcon={Search}
      value={draft}
      maxLength={80}
      onChange={(event) => change(event.target.value)}
      containerClassName="flex-1"
    />
  );
}

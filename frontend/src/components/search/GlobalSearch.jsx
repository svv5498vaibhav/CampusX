import { useState } from 'react';
import { Search } from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { SearchInput } from '@/components/search/SearchInput';
import { searchResultPath } from '@/constants/search';
import { ROUTES, searchPath } from '@/constants/routes';
import { cn } from '@/utils/cn';

/** Opens what a suggestion or recent search points to: a search, or the item itself. */
export function useOpenSearchItem() {
  const navigate = useNavigate();
  return (item) => {
    if (item.kind === 'search' || item.kind === 'recent') navigate(searchPath(item.query, item.type));
    else navigate(searchResultPath(item.kind, item));
  };
}

function SearchLink({ className, labelOnLarge = false }) {
  return (
    <NavLink
      to={ROUTES.SEARCH}
      aria-label="Search CampusX"
      title="Search CampusX"
      className={({ isActive }) =>
        cn('grid place-items-center text-sm font-semibold transition-colors', isActive ? 'bg-primary-soft text-primary-soft-fg' : 'text-ink-muted hover:bg-surface-muted hover:text-ink', className)
      }
    >
      <Search className="size-5" aria-hidden="true" />
      <span className={labelOnLarge ? 'sr-only lg:not-sr-only' : 'sr-only'}>Search</span>
    </NavLink>
  );
}

/**
 * Search in the campus navigation.
 *   sidebar  laptops: a "Search CampusX" box with suggestions; tablets (icon rail): a search button
 *   topbar   phones: a search button that opens the search page
 * On the search page itself the box steps aside for the page's own, bigger one.
 */
export function GlobalSearch({ variant = 'sidebar' }) {
  const navigate = useNavigate();
  const openItem = useOpenSearchItem();
  const { pathname } = useLocation();
  const [text, setText] = useState('');
  const onSearchPage = pathname === ROUTES.SEARCH;

  if (variant === 'topbar') return <SearchLink className="size-10 rounded-xl" />;

  return (
    <>
      <SearchLink labelOnLarge className={cn('h-12 w-full rounded-2xl', onSearchPage ? 'lg:flex lg:items-center lg:justify-start lg:gap-3 lg:px-4' : 'lg:hidden')} />
      {!onSearchPage && (
        <SearchInput
          value={text}
          onValueChange={setText}
          onSubmit={(query) => {
            setText('');
            navigate(searchPath(query));
          }}
          onSelect={(item) => {
            setText('');
            openItem(item);
          }}
          placeholder="Search CampusX"
          className="hidden lg:block"
          popupWidth="w-[22rem]"
        />
      )}
    </>
  );
}

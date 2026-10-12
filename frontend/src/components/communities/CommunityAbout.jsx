import { CalendarDays, ScrollText, ShieldCheck, Tags } from 'lucide-react';
import { Link } from 'react-router';
import { Card } from '@/components/ui';
import { COMMUNITY_VISIBILITY_ICONS, communityScopeLine, communityTypeLabel } from '@/constants/communities';
import { profilePath } from '@/constants/routes';
import { useCommunityStore } from '@/store/communityStore';
import { getFullName } from '@/utils/string';

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/** About tab: description, rules, tags, who can join and who started it. */
export function CommunityAbout({ community }) {
  const options = useCommunityStore((state) => state.options);
  const visibility = options?.visibility.find((option) => option.id === community.visibility);
  const VisibilityIcon = COMMUNITY_VISIBILITY_ICONS[community.visibility];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="font-display text-lg font-bold text-ink">About</h2>
        <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-muted">{community.description}</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex items-start gap-2">
            <VisibilityIcon className="mt-0.5 size-4 text-primary" aria-hidden="true" />
            <div>
              <dt className="font-semibold text-ink">Who can join</dt>
              <dd className="text-ink-muted">
                {visibility?.label ?? community.visibility} · {communityScopeLine(community)}
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 text-primary" aria-hidden="true" />
            <div>
              <dt className="font-semibold text-ink">Type</dt>
              <dd className="text-ink-muted">
                {communityTypeLabel(options, community.type)}
                {community.official ? ' · Official CampusX community' : ''}
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <CalendarDays className="mt-0.5 size-4 text-primary" aria-hidden="true" />
            <div>
              <dt className="font-semibold text-ink">Started</dt>
              <dd className="text-ink-muted">
                {dateFormat.format(new Date(community.createdAt))}
                {community.createdBy && (
                  <>
                    {' by '}
                    <Link to={profilePath(community.createdBy.id)} className="font-semibold text-primary hover:underline">
                      {getFullName(community.createdBy)}
                    </Link>
                  </>
                )}
              </dd>
            </div>
          </div>
        </dl>
      </Card>

      <Card>
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
          <ScrollText className="size-5 text-primary" aria-hidden="true" /> Community rules
        </h2>
        {community.rules?.length ? (
          <ol className="mt-3 flex flex-col gap-2">
            {community.rules.map((rule, index) => (
              <li key={`${index}-${rule}`} className="flex gap-3 rounded-xl bg-surface-muted px-3 py-2.5 text-sm text-ink">
                <span className="font-bold text-primary">{index + 1}</span>
                <span className="break-words">{rule}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">No rules yet. Be kind, stay on topic and look out for each other.</p>
        )}
      </Card>

      {community.tags.length > 0 && (
        <Card>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
            <Tags className="size-5 text-primary" aria-hidden="true" /> Tags
          </h2>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {community.tags.map((tag) => (
              <li key={tag} className="rounded-lg bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary-soft-fg">#{tag}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

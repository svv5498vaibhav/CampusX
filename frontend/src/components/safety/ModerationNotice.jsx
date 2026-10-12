import { Link } from 'react-router';
import { ContentWarning } from '@/components/safety/ContentWarning';
import { ROUTES } from '@/constants/routes';

const MESSAGES = {
  pending: { tone: 'review', title: 'Pending review', text: (noun) => `This ${noun} is waiting for a quick review before other students can see it.` },
  restricted: { tone: 'review', title: 'Under review', text: (noun) => `This ${noun} is temporarily unavailable while it is being reviewed. Only you can see it right now.` },
  removed: { tone: 'removed', title: 'Removed', text: (noun) => `This ${noun} was removed because it may violate CampusX guidelines.` },
};

/**
 * What a student sees on their own content when Trust & Safety is holding it back. Only the status: never
 * scores, rules, case ids or who reported it. The API only ever sends `moderation` to the content's
 * owner, so nobody else sees this.
 */
export function ModerationNotice({ status, noun = 'post', className }) {
  const message = MESSAGES[status];
  if (!message) return null;
  return (
    <ContentWarning
      tone={message.tone}
      title={message.title}
      className={className}
      role="status"
      data-moderation-status={status}
      action={
        <Link to={ROUTES.SAFETY} className="text-xs font-semibold underline underline-offset-2">
          Read the community guidelines
        </Link>
      }
    >
      {message.text(noun)}
    </ContentWarning>
  );
}

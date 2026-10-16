import { Ban, HeartHandshake, Link2Off, Lock, MessageSquareWarning, Siren, UserX, VenetianMask, Zap } from 'lucide-react';

/** The CampusX community guidelines, in plain student language. */
export const GUIDELINES = [
  { icon: HeartHandshake, title: 'Respect other students', text: 'Disagree with ideas, not people. Everyone here is a classmate, a senior or a junior.' },
  { icon: MessageSquareWarning, title: 'No harassment', text: 'No bullying, name-calling, mocking someone’s looks, caste, religion, gender or background, and no ganging up on anyone.' },
  { icon: Siren, title: 'No threats', text: 'Never threaten anyone, even as a joke. Threats are always sent to a CampusX moderator.' },
  { icon: Ban, title: 'No spam', text: 'No “get rich quick” offers, repeated posts, copy-pasted comments or clickbait. Share things once, where they fit.' },
  { icon: Zap, title: 'No fake engagement', text: 'Likes and comments should be real. Liking in bulk or trading likes doesn’t earn points on Campus Rankings.' },
  { icon: Link2Off, title: 'No harmful links', text: 'Only share links you trust. Hidden, shortened or look-alike links may be held for review.' },
  { icon: UserX, title: 'No impersonation', text: 'Be yourself. Don’t pretend to be another student, a teacher, a club or the college.' },
  { icon: Lock, title: 'Protect private information', text: 'Never share someone’s phone number, address, roll number, photos or messages without their permission. Yours too.' },
  { icon: VenetianMask, title: 'Anonymous posts follow the same rules', text: 'The Anonymous Zone hides your name from students, not from the rules. CampusX can still act on harmful anonymous posts, without revealing who wrote them.' },
];

/** The guidelines as a list of friendly cards. */
export function SafetyGuidelines({ headingLevel = 'h3' }) {
  const Heading = headingLevel;
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {GUIDELINES.map(({ icon: Icon, title, text }) => (
        <li key={title} className="flex gap-3 glass-card rounded-3xl border border-line bg-surface p-4 shadow-soft">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary-soft-fg" aria-hidden="true">
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <Heading className="font-display text-base font-bold text-ink">{title}</Heading>
            <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

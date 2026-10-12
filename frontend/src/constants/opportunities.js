import {
  Blend,
  Bookmark,
  Briefcase,
  CalendarDays,
  CircleX,
  Code2,
  FlaskConical,
  Globe,
  GraduationCap,
  Lightbulb,
  ListChecks,
  MapPin,
  PartyPopper,
  Presentation,
  Send,
  Sparkles,
  Sprout,
  Star,
  Trophy,
  Undo2,
  Wrench,
} from 'lucide-react';
import { safeExternalUrl } from '@/utils/url';
import { ROUTES } from './routes';

/*
 * Icons and colours for opportunities. Labels, limits and option lists come from the API
 * (/opportunities/options) so they always match what the server accepts.
 */

export const OPPORTUNITY_TYPE_ICONS = {
  internship: Briefcase,
  hackathon: Code2,
  competition: Trophy,
  scholarship: GraduationCap,
  fellowship: Sprout,
  workshop: Wrench,
  seminar: Presentation,
  event: CalendarDays,
  research: FlaskConical,
  project: Lightbulb,
  other: Sparkles,
};

export const OPPORTUNITY_MODE_ICONS = { online: Globe, offline: MapPin, hybrid: Blend };

/** The student's own tracking. Calm colours: nothing here is an official verdict from CampusX. */
export const TRACKING_BADGES = {
  saved: { icon: Bookmark, variant: 'primary' },
  interested: { icon: Star, variant: 'accent' },
  applied: { icon: Send, variant: 'primary' },
  shortlisted: { icon: ListChecks, variant: 'accent' },
  selected: { icon: PartyPopper, variant: 'primary' },
  rejected: { icon: CircleX, variant: 'neutral' },
  withdrawn: { icon: Undo2, variant: 'neutral' },
};

/** Opportunity status badges on the management page. */
export const OPPORTUNITY_STATUS_BADGES = { draft: 'outline', published: 'primary', closed: 'neutral', archived: 'neutral' };

const labelFrom = (list, id) => list?.find((item) => item.id === id)?.label ?? id;
export const typeLabel = (options, id) => labelFrom(options?.types, id);
export const modeLabel = (options, id) => labelFrom(options?.modes, id);
export const trackingLabel = (options, id) => labelFrom(options?.trackingStatuses, id);
export const opportunityStatusLabel = (options, id) => labelFrom(options?.statuses, id);

export const opportunityPath = (opportunityId) => `${ROUTES.OPPORTUNITIES}/${encodeURIComponent(opportunityId)}`;
export const opportunityUrl = (opportunityId) => `${window.location.origin}${opportunityPath(opportunityId)}`;
export const editOpportunityPath = (opportunityId) => `${ROUTES.ADMIN_OPPORTUNITIES}/${encodeURIComponent(opportunityId)}/edit`;

// Shared with projects and achievements (utils/url.js); kept here for the opportunity pages' imports.
export { safeExternalUrl };

/** Where students apply: the application link, else the registration link. */
export function applyLink(opportunity) {
  const application = safeExternalUrl(opportunity.applicationUrl);
  if (application) return { url: application, label: 'Apply Now', verb: 'apply' };
  const registration = safeExternalUrl(opportunity.registrationUrl);
  return registration ? { url: registration, label: 'Register Now', verb: 'register' } : null;
}

// ----------------------------------------------------------------------------- dates

const DAY_MS = 24 * 60 * 60 * 1000;
const dayFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const shortDayFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** "15 October 2026" */
export const formatDay = (value) => (value ? dayFormat.format(new Date(value)) : '');
/** "15 Oct" */
export const formatShortDay = (value) => (value ? shortDayFormat.format(new Date(value)) : '');
/** "15 October 2026 at 11:59 pm" */
export const formatDeadline = (value) => (value ? dateTimeFormat.format(new Date(value)) : '');

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/**
 * The deadline as students see it, from the real dates (never a fixed countdown):
 *   state: 'open' | 'closing-soon' | 'closed' | 'rolling'
 *   label: "5 days left" · "Tomorrow" · "Deadline today" · "Closed" · "No deadline"
 * Closed also covers a moderator closing it early. `closingSoonDays` comes from the API rules.
 */
export function deadlineInfo(opportunity, now = Date.now(), closingSoonDays = 3) {
  const deadline = opportunity.applicationDeadline ? new Date(opportunity.applicationDeadline) : null;
  const current = new Date(now);
  if (opportunity.status === 'closed' || opportunity.status === 'archived' || (deadline && deadline <= current)) return { state: 'closed', label: 'Closed' };
  if (!deadline) return { state: 'rolling', label: 'No deadline' };
  const days = Math.round((startOfDay(deadline) - startOfDay(current)) / DAY_MS);
  const label = days <= 0 ? 'Deadline today' : days === 1 ? 'Tomorrow' : `${days} days left`;
  return { state: deadline - current <= closingSoonDays * DAY_MS ? 'closing-soon' : 'open', label };
}

const pad = (number) => String(number).padStart(2, '0');
/** <input type="date"> value in the student's own time zone. */
export const toLocalDateInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
/** <input type="datetime-local"> value in the student's own time zone. */
export const toLocalDateTimeInput = (value) => (value ? `${toLocalDateInput(value)}T${pad(new Date(value).getHours())}:${pad(new Date(value).getMinutes())}` : '');
/** A local date/datetime input value as an ISO timestamp for the API ('' stays empty). */
export const fromLocalInput = (value) => (value ? new Date(value.length === 10 ? `${value}T00:00` : value).toISOString() : '');

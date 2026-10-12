import { createLegacyReport } from './reportService.js';

export const ALREADY_REPORTED = 'Already reported. Our team will take a look.';

/*
 * Reports about anonymous posts and comments, through the Trust & Safety report service
 * (services/reportService.js): one active report per student per post or comment, reporters never shown,
 * reports from several students flag the content for review (it stays visible until a moderator acts).
 * The author is only ever used internally (you can't report your own post), never revealed.
 */

export async function reportAnonymousPost(postId, viewer, report) {
  await createLegacyReport(viewer, { family: 'anonymous', targetType: 'anonymousPost', targetId: postId, ...report }, { duplicate: ALREADY_REPORTED, own: "You can't report your own post.", notFound: 'Post not found.' });
}

export async function reportAnonymousComment(commentId, viewer, report) {
  await createLegacyReport(viewer, { family: 'anonymous', targetType: 'anonymousComment', targetId: commentId, ...report }, { duplicate: ALREADY_REPORTED, own: "You can't report your own comment.", notFound: 'Comment not found.' });
}

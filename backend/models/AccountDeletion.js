import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import { ACCOUNT_DELETION } from '../config/securityConfig.js';

/** A Cloudinary file that belonged to the deleted account and still has to be removed. */
const pendingMediaSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true },
    resourceType: { type: String, enum: ['image', 'video', 'raw'], required: true },
  },
  { _id: false },
);

const ids = () => ({ type: [{ type: mongoose.Schema.Types.ObjectId }], default: undefined });

/**
 * One record per account deletion, written only by services/accountDeletionService.js. It outlives the
 * user document so that interrupted work can be finished: the Cloudinary files the account owned are listed
 * here before their database records are deleted, and removed from Cloudinary only once `purgedAt` is set
 * (the database no longer points at them). jobs/accountDeletionCleanup.js retries what is left.
 *
 *   purgedAt     every database record of the account is gone (set in the same transaction as the purge
 *                when MongoDB supports transactions, and just before the user document is deleted)
 *   finishedAt   the follow-up ran: live connections closed, other students' points and counts reconciled
 *                from `affected`, new community owners told, the deletion audited
 *   completedAt  nothing left to do (no files left, or retrying them gave up)
 *
 * Holds no personal data: the old account id, dates, ids of affected posts and communities until the
 * follow-up has run, Cloudinary ids still to remove, counts and short error text. Finished records expire
 * ACCOUNT_DELETION.keepRecordDays after `completedAt`. The permanent trace of a deletion is the
 * ACCOUNT_DELETED row in the admin audit log.
 */
const accountDeletionSchema = new mongoose.Schema(
  {
    // The deleted account's id. Not a reference: that document no longer exists once the purge is done.
    user: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    requestedAt: { type: Date, required: true },
    purgedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    // Other students' things the deletion touched, recorded before they change so a resumed deletion can
    // still reconcile them: posts the account liked or commented on, communities it was a member of,
    // communities archived or handed to a moderator because the account was their only owner.
    affected: {
      likedPosts: ids(),
      commentedPosts: ids(),
      communities: ids(),
      archivedCommunities: ids(),
      newOwners: { type: [{ community: mongoose.Schema.Types.ObjectId, user: mongoose.Schema.Types.ObjectId, _id: false }], default: undefined },
    },
    // What was removed, for the audit row (approximate if a deletion was interrupted and resumed).
    summary: {
      posts: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      projects: { type: Number, default: 0 },
      achievements: { type: Number, default: 0 },
      communitiesArchived: { type: Number, default: 0 },
      communitiesHandedOver: { type: Number, default: 0 },
    },
    media: { type: [pendingMediaSchema], default: [] },
    mediaAttempts: { type: Number, default: 0, min: 0 },
    nextMediaAttemptAt: { type: Date, default: null },
    // Retrying stopped after ACCOUNT_DELETION.media.maxAttempts; the files are logged for manual cleanup.
    mediaGaveUpAt: { type: Date, default: null },
    lastError: { type: String, maxlength: 200, default: null },
    // Nothing left to do (purged and no files left, or retrying gave up).
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// The collection only holds the last ACCOUNT_DELETION.keepRecordDays of deletions, so the cleanup job's
// queries need no index of their own.
accountDeletionSchema.index({ completedAt: 1 }, { expireAfterSeconds: ACCOUNT_DELETION.keepRecordDays * 24 * 60 * 60 });

const AccountDeletion = mongoose.model('AccountDeletion', accountDeletionSchema);
watchIndexBuild(AccountDeletion);

export default AccountDeletion;

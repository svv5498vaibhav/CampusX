import mongoose from 'mongoose';
import { BYTES_PER_MB, MEDIA_PRESETS } from '../config/media.js';
import { PUBLIC_STATUSES } from '../config/moderationConfig.js';
import {
  COMMUNITY_FILTERS,
  COMMUNITY_RULES,
  COMMUNITY_SORTS,
  COMMUNITY_TYPES,
  COMMUNITY_VISIBILITY,
  MEMBER_ROLES,
  VISIBILITY_FOR_TYPE,
} from '../data/communityOptions.js';
import Community from '../models/Community.js';
import CommunityMember from '../models/CommunityMember.js';
import ApiError from '../utils/ApiError.js';
import { slugify } from '../utils/slug.js';
import { CAMPUS_EVENTS, emitCampusEvent } from './campusEvents.js';
import { getBranch, getCollege, getInterest, getSemester } from './campusOptionsService.js';
import { forgetMemberships, MANAGER_ROLES, scopeAllows, scopeFilter, viewerMemberships } from './communityAccess.js';
import { analyzeCommunityContent, assertCanPublish, ownerModeration, recordOutcome, stricterStatus } from './moderationService.js';
import { listCommunityFeed, toObjectId } from './postService.js';
import { getStudentSummaries } from './profileService.js';

export const COMMUNITY_NOT_FOUND = 'Community not found.';
const NAME_TAKEN = 'A community with this name already exists. Please choose another name.';
const NOT_A_MEMBER = "You're not a member of this community.";

/*
 * Every function takes `viewer`: the signed-in student's user document, loaded from the database by
 * authenticate (req.user). College, branch and semester always come from it, never from the request.
 */

// ----------------------------------------------------------------------------- helpers

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "CSE Students" → "cse-students". Campus-scoped communities add their college, so two campuses can share a name. */
const slugFor = (name, college) => (college ? `${slugify(name, 'community')}-${college}` : slugify(name, 'community'));

const isDuplicateKey = (error) => error?.code === 11000;

// Trust & Safety: students who aren't members only find communities in good standing (older ones have no
// status: approved). A removed community is gone for everyone; a restricted one stays open to its members.
export const IN_GOOD_STANDING = Object.freeze({ moderationStatus: { $in: [...PUBLIC_STATUSES, null] } });
const NOT_REMOVED = Object.freeze({ moderationStatus: { $ne: 'removed' } });
const inGoodStanding = (community) => PUBLIC_STATUSES.includes(community.moderationStatus ?? 'approved');

async function loadCommunity(communityId, projection = '') {
  const id = toObjectId(communityId);
  const community = id ? await Community.findById(id).select(projection) : null;
  if (!community) throw ApiError.notFound(COMMUNITY_NOT_FOUND);
  return community;
}

/** The scope a new community gets: always the creator's own college/branch/semester from the database. */
function scopeFor(visibility, viewer) {
  if (visibility === 'public') return {};
  if (!viewer.college) throw ApiError.forbidden('Please finish setting up your campus profile first.');
  if (visibility === 'college') return { college: viewer.college };
  if (!viewer.branch) throw ApiError.forbidden('Please add your branch to your profile first.');
  if (visibility === 'branch') return { college: viewer.college, branch: viewer.branch };
  if (!viewer.semester) throw ApiError.forbidden('Please add your semester to your profile first.');
  return { college: viewer.college, branch: viewer.branch, semester: viewer.semester };
}

/** College, branch and semester ids resolved to labels for display. */
async function scopeLabels(community) {
  const [college, branch] = await Promise.all([
    community.college ? getCollege(community.college) : null,
    community.branch ? getBranch(community.branch) : null,
  ]);
  const semester = community.semester ? getSemester(community.semester) : null;
  return {
    college: college ? { id: college.id, name: college.name } : null,
    branch: branch ? { id: branch.id, name: branch.name, shortName: branch.shortName ?? branch.name } : null,
    semester: semester ? { value: semester.value, label: semester.label } : null,
  };
}

/** Why the viewer's campus identity doesn't fit a community, in plain words (or null when it does). */
function scopeRefusal(community, labels) {
  const college = labels.college?.name ?? 'its campus';
  switch (community.visibility) {
    case 'college':
      return `Only students at ${college} can join this community.`;
    case 'branch':
      return `Only ${labels.branch?.name ?? 'branch'} students at ${college} can join this community.`;
    case 'restricted':
      return `Only ${labels.branch?.shortName ?? 'branch'} students in the ${labels.semester?.label ?? 'same semester'} at ${college} can join this community.`;
    default:
      return 'You can’t join this community.';
  }
}

/** What the viewer may do: shown as buttons, and checked again by every endpoint. */
function joinState(community, membership, viewer, labels) {
  if (membership?.status === 'active') return { canJoin: false, joinBlockedReason: null };
  if (community.status !== 'active') return { canJoin: false, joinBlockedReason: 'This community is archived.' };
  if (membership?.status === 'banned') return { canJoin: false, joinBlockedReason: 'You were removed from this community.' };
  if (!scopeAllows(community, viewer)) return { canJoin: false, joinBlockedReason: scopeRefusal(community, labels) };
  return { canJoin: true, joinBlockedReason: null };
}

/** The public face of a community. No member lists, Cloudinary ids or creator account data. */
async function toCommunityView(community, membership, viewer) {
  const labels = await scopeLabels(community);
  return {
    id: community._id.toString(),
    name: community.name,
    slug: community.slug,
    description: community.description ?? '',
    type: community.type,
    visibility: community.visibility,
    ...labels,
    iconUrl: community.iconUrl ?? null,
    coverImageUrl: community.coverImageUrl ?? null,
    memberCount: community.memberCount ?? 0,
    tags: [...(community.tags ?? [])],
    official: Boolean(community.official),
    status: community.status,
    createdAt: community.createdAt,
    membership: membership && membership.status !== 'left' ? { status: membership.status, role: membership.role } : null,
    // Only its owners and moderators see that the community is held for review.
    ...(membership?.status === 'active' && MANAGER_ROLES.includes(membership.role) && ownerModeration(community.moderationStatus) && { moderation: ownerModeration(community.moderationStatus) }),
    ...joinState(community, membership, viewer, labels),
  };
}

/** Views for a list, with one membership query for the whole page (no N+1). */
export async function presentCommunities(communities, viewer) {
  if (communities.length === 0) return [];
  const memberships = await CommunityMember.find({ user: viewer._id, community: { $in: communities.map((c) => c._id) } })
    .select('community status role')
    .lean();
  const byCommunity = new Map(memberships.map((m) => [m.community.toString(), m]));
  return Promise.all(communities.map((c) => toCommunityView(c, byCommunity.get(c._id.toString()) ?? null, viewer)));
}

const membershipOf = (communityId, userId) => CommunityMember.findOne({ community: communityId, user: userId });

/** Viewable by students whose campus identity fits it, and always by its active members. */
async function assertCanView(community, membership, viewer) {
  if (community.moderationStatus === 'removed') throw ApiError.notFound(COMMUNITY_NOT_FOUND);
  if (membership?.status === 'active') return;
  if (!inGoodStanding(community)) throw ApiError.notFound(COMMUNITY_NOT_FOUND);
  if (community.status === 'active' && scopeAllows(community, viewer)) return;
  if (community.status !== 'active') throw ApiError.notFound(COMMUNITY_NOT_FOUND);
  throw ApiError.forbidden(scopeRefusal(community, await scopeLabels(community)));
}

/** Owners (and, where allowed, moderators) only. Returns the community and the viewer's role. */
async function loadForManagement(communityId, viewer, roles) {
  const community = await loadCommunity(communityId);
  const membership = await membershipOf(community._id, viewer._id);
  if (membership?.status !== 'active' || !roles.includes(membership.role)) {
    throw ApiError.forbidden(
      roles.includes('moderator')
        ? 'Only this community’s owners and moderators can do that.'
        : 'Only this community’s owners can do that.',
    );
  }
  return { community, membership };
}

const adjustMemberCount = (communityId, by) =>
  Community.updateOne({ _id: communityId, ...(by < 0 && { memberCount: { $gt: 0 } }) }, { $inc: { memberCount: by } });

// ----------------------------------------------------------------------------- official communities

// Slugs confirmed recently, so the upserts below don't run on every request. The memory expires, so a
// community removed later (e.g. by an admin) comes back within minutes instead of after a restart.
const ENSURED_FOR_MS = 10 * 60 * 1000;
const ensuredAt = new Map();

async function ensureOfficial(spec) {
  if (Date.now() - (ensuredAt.get(spec.slug) ?? 0) < ENSURED_FOR_MS) return;
  try {
    await Community.updateOne({ slug: spec.slug }, { $setOnInsert: { ...spec, official: true, createdBy: null } }, { upsert: true });
  } catch (error) {
    // Two requests creating the same community at once: the other one won.
    if (!isDuplicateKey(error)) throw error;
  }
  ensuredAt.set(spec.slug, Date.now());
}

/**
 * CampusX keeps an official community for every college, every branch at a college and every
 * interest. They are created the first time a student who belongs to them looks at communities.
 */
export async function ensureOfficialCommunities(viewer) {
  const specs = [];
  const college = viewer.college ? await getCollege(viewer.college) : null;
  if (college) {
    specs.push({
      slug: slugFor(college.name, college.id),
      name: college.name,
      type: 'college',
      visibility: 'college',
      college: college.id,
      description: `Everyone at ${college.name}: campus news, questions, events and help from fellow students.`,
      tags: ['campus', ...(college.aliases?.length ? [college.aliases[0].toLowerCase()] : [])],
    });
    const branch = viewer.branch && viewer.branch !== 'other' ? await getBranch(viewer.branch) : null;
    if (branch) {
      const name = `${branch.shortName ?? branch.name} Students`;
      specs.push({
        slug: slugFor(name, college.id),
        name,
        type: 'branch',
        visibility: 'branch',
        college: college.id,
        branch: branch.id,
        description: `${branch.name} students at ${college.name}: classes, labs, exams, notes and projects.`,
        tags: ['branch', (branch.shortName ?? branch.name).toLowerCase()],
      });
    }
  }
  for (const interestId of viewer.interests ?? []) {
    const interest = interestId !== 'other' ? await getInterest(interestId) : null;
    if (!interest) continue;
    specs.push({
      slug: slugFor(interest.name),
      name: interest.name,
      type: 'interest',
      visibility: 'public',
      description: `Students across CampusX into ${interest.name}: share what you're learning, building and planning.`,
      tags: [interest.name.toLowerCase()],
    });
  }
  await Promise.all(specs.map(ensureOfficial));
  return specs.map((spec) => spec.slug);
}

// ----------------------------------------------------------------------------- reading

const SORTS = {
  popular: { memberCount: -1, official: -1, name: 1, _id: 1 },
  new: { createdAt: -1, _id: -1 },
};

/** Discovery: active communities the viewer can join (or already belongs to), with search and filters. */
export async function listCommunities(viewer, { search, filter = 'all', sort = 'popular', page = 1, limit = COMMUNITY_RULES.pageSize.default }) {
  await ensureOfficialCommunities(viewer);
  const memberIds = [...(await viewerMemberships(viewer)).keys()].map((id) => new mongoose.Types.ObjectId(id));

  const conditions =
    filter === 'mine'
      ? [{ _id: { $in: memberIds } }, NOT_REMOVED]
      : [{ status: 'active' }, NOT_REMOVED, { $or: [{ $and: [scopeFilter(viewer), IN_GOOD_STANDING] }, { _id: { $in: memberIds } }] }];
  if (!['all', 'mine'].includes(filter)) conditions.push({ type: filter });
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    conditions.push({ $or: [{ name: pattern }, { description: pattern }, { tags: pattern }] });
  }

  const match = { $and: conditions };
  const [communities, total] = await Promise.all([
    Community.find(match).sort(SORTS[sort] ?? SORTS.popular).skip((page - 1) * limit).limit(limit).lean(),
    Community.countDocuments(match),
  ]);
  return {
    communities: await presentCommunities(communities, viewer),
    pagination: { page, limit, total, hasMore: page * limit < total },
  };
}

/** The viewer's own communities (active memberships, archived ones included), newest first. */
export async function listMyCommunities(viewer) {
  const memberships = await CommunityMember.find({ user: viewer._id, status: 'active' }).sort({ joinedAt: -1 }).limit(100).lean();
  const communities = await Community.find({ _id: { $in: memberships.map((m) => m.community) } }).lean();
  const byId = new Map(communities.map((c) => [c._id.toString(), c]));
  const ordered = memberships.map((m) => byId.get(m.community.toString())).filter(Boolean);
  return { communities: await presentCommunities(ordered, viewer) };
}

/**
 * Simple, rule-based suggestions (no machine learning), in this order:
 * the student's campus and branch communities, communities for their interests, popular communities
 * on their campus, then public communities tagged with their interests or skills.
 */
export async function recommendCommunities(viewer) {
  const officialSlugs = await ensureOfficialCommunities(viewer);
  const [roles, banned] = await Promise.all([
    viewerMemberships(viewer),
    CommunityMember.find({ user: viewer._id, status: 'banned' }).distinct('community'),
  ]);
  const exclude = [...[...roles.keys()].map((id) => new mongoose.Types.ObjectId(id)), ...banned];
  const interestNames = (await Promise.all((viewer.interests ?? []).map(getInterest))).filter(Boolean).map((i) => i.name.toLowerCase());
  const keywords = [...new Set([...interestNames, ...(viewer.skills ?? []).map((skill) => skill.toLowerCase())])];

  const candidates = await Community.find({
    $and: [
      { status: 'active', _id: { $nin: exclude } },
      scopeFilter(viewer),
      IN_GOOD_STANDING,
      {
        $or: [
          { slug: { $in: officialSlugs } },
          ...(viewer.college ? [{ college: viewer.college }] : []),
          ...(keywords.length ? [{ tags: { $in: keywords } }] : []),
        ],
      },
    ],
  })
    .sort({ memberCount: -1, name: 1 })
    .limit(60)
    .lean();

  const rank = (community) => {
    if (officialSlugs.includes(community.slug)) {
      if (community.type === 'college') return [0, 'Your campus'];
      if (community.type === 'branch') return [1, 'Your branch'];
      return [2, 'One of your interests'];
    }
    if (viewer.college && community.college === viewer.college) return [3, 'Popular on your campus'];
    return [4, 'Matches your interests and skills'];
  };
  const picked = candidates
    .map((community) => ({ community, rank: rank(community) }))
    .sort((a, b) => a.rank[0] - b.rank[0] || b.community.memberCount - a.community.memberCount || a.community.name.localeCompare(b.community.name))
    .slice(0, COMMUNITY_RULES.recommended);

  const views = await presentCommunities(picked.map((item) => item.community), viewer);
  return { communities: views.map((view, index) => ({ ...view, reason: picked[index].rank[1] })) };
}

/** One community with its rules, creator and the viewer's permissions. */
export async function getCommunity(communityId, viewer) {
  const community = await loadCommunity(communityId);
  const membership = await membershipOf(community._id, viewer._id);
  await assertCanView(community, membership, viewer);

  const [view, creators] = await Promise.all([
    toCommunityView(community, membership, viewer),
    community.createdBy ? getStudentSummaries([community.createdBy]) : new Map(),
  ]);
  const role = membership?.status === 'active' ? membership.role : null;
  return {
    ...view,
    rules: [...(community.rules ?? [])],
    createdBy: community.createdBy ? (creators.get(community.createdBy.toString()) ?? null) : null,
    permissions: {
      canPost: Boolean(role) && community.status === 'active',
      canEdit: role === 'owner',
      canManageMembers: MANAGER_ROLES.includes(role),
      canChangeRoles: role === 'owner',
    },
  };
}

const ROLE_RANK = { owner: 0, moderator: 1, member: 2 };

/** Active members, owners first, a page at a time. Only public profile details are returned. */
export async function listMembers(communityId, viewer, { page = 1, limit = COMMUNITY_RULES.memberPageSize.default }) {
  const community = await loadCommunity(communityId);
  await assertCanView(community, await membershipOf(community._id, viewer._id), viewer);

  const match = { community: community._id, status: 'active' };
  const [rows, total] = await Promise.all([
    CommunityMember.aggregate([
      { $match: match },
      { $addFields: { roleRank: { $switch: { branches: Object.entries(ROLE_RANK).map(([role, rank]) => ({ case: { $eq: ['$role', role] }, then: rank })), default: 3 } } } },
      { $sort: { roleRank: 1, joinedAt: 1, _id: 1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]),
    CommunityMember.countDocuments(match),
  ]);
  const students = await getStudentSummaries(rows.map((row) => row.user));
  return {
    members: rows
      .filter((row) => students.has(row.user.toString()))
      .map((row) => ({
        student: students.get(row.user.toString()),
        role: row.role,
        joinedAt: row.joinedAt,
        isYou: row.user.equals(viewer._id),
      })),
    pagination: { page, limit, total, hasMore: page * limit < total },
  };
}

/** The community's posts (Phase 5 posts with `community` set). Members only. */
export async function listCommunityPosts(communityId, viewer, { page, limit }) {
  const community = await loadCommunity(communityId, 'status');
  if (!(await viewerMemberships(viewer)).has(community.id)) {
    throw ApiError.forbidden('Join this community to see its posts.');
  }
  return listCommunityFeed(community._id, viewer, { page, limit });
}

// ----------------------------------------------------------------------------- creating and editing

/**
 * Creates a student community. The creator (from the session) becomes its owner; its campus scope
 * is the creator's own college/branch/semester. Any college or branch in the request is ignored.
 */
export async function createCommunity(viewer, { name, description, type, visibility, tags, rules = [] }) {
  if (!viewer.onboardingCompleted) throw ApiError.forbidden('Please finish setting up your campus profile first.');
  await assertCanPublish(viewer);
  if (!VISIBILITY_FOR_TYPE[type]?.includes(visibility)) {
    throw ApiError.unprocessable('That visibility isn’t available for this type of community.', [{ field: 'visibility', message: 'Choose another visibility.' }]);
  }
  const scope = scopeFor(visibility, viewer);
  const slug = slugFor(name, scope.college);
  if (await Community.exists({ slug })) throw ApiError.conflict(NAME_TAKEN, [{ field: 'name', message: NAME_TAKEN }]);

  // Trust & Safety checks the name, description, tags and rules.
  const verdict = await analyzeCommunityContent(viewer, { name, description, tags, rules });
  let community;
  try {
    community = await Community.create({
      name, slug, description, type, visibility, ...scope, tags, rules,
      createdBy: viewer._id, official: false, memberCount: 1, moderationStatus: verdict.status,
    });
  } catch (error) {
    if (isDuplicateKey(error)) throw ApiError.conflict(NAME_TAKEN, [{ field: 'name', message: NAME_TAKEN }]);
    throw error;
  }

  try {
    await CommunityMember.create({ community: community._id, user: viewer._id, role: 'owner' });
  } catch (error) {
    // Never leave a community without its owner.
    await Community.deleteOne({ _id: community._id });
    throw error;
  }

  forgetMemberships(viewer);
  await recordOutcome({ targetType: 'community', targetId: community._id, ownerId: viewer._id, verdict });
  emitCampusEvent(CAMPUS_EVENTS.COMMUNITY_CREATED, { communityId: community.id, actorId: viewer.id });
  return getCommunity(community.id, viewer);
}

/** Owners edit the name, description, tags and rules, or archive/restore. Type and scope never change. */
export async function updateCommunity(communityId, viewer, changes) {
  const { community } = await loadForManagement(communityId, viewer, ['owner']);
  if (community.official) throw ApiError.forbidden('Official CampusX communities can’t be edited.');
  if (community.moderationStatus === 'removed') throw ApiError.conflict('This community was removed and can’t be edited.');

  const update = {};
  for (const field of ['description', 'tags', 'rules', 'status']) {
    if (changes[field] !== undefined) update[field] = changes[field];
  }
  if (changes.name !== undefined && changes.name !== community.name) {
    update.name = changes.name;
    update.slug = slugFor(changes.name, community.college);
    if (update.slug !== community.slug && (await Community.exists({ slug: update.slug }))) {
      throw ApiError.conflict(NAME_TAKEN, [{ field: 'name', message: NAME_TAKEN }]);
    }
  }

  // Changed text is checked again; it can raise the moderation status but never lower it.
  const textChanged = ['name', 'description', 'tags', 'rules'].some((field) => update[field] !== undefined);
  const previousStatus = community.moderationStatus ?? 'approved';
  let verdict = null;
  if (textChanged) {
    await assertCanPublish(viewer);
    const merged = Object.fromEntries(['name', 'description', 'tags', 'rules'].map((field) => [field, update[field] ?? community[field] ?? (field === 'tags' || field === 'rules' ? [] : '')]));
    verdict = await analyzeCommunityContent(viewer, merged, { excludeId: community._id, isNew: false });
    update.moderationStatus = stricterStatus(previousStatus, verdict.status);
  }

  try {
    await Community.updateOne({ _id: community._id }, { $set: update }, { runValidators: true });
  } catch (error) {
    if (isDuplicateKey(error)) throw ApiError.conflict(NAME_TAKEN, [{ field: 'name', message: NAME_TAKEN }]);
    throw error;
  }

  if (verdict) await recordOutcome({ targetType: 'community', targetId: community._id, ownerId: viewer._id, verdict: { ...verdict, status: update.moderationStatus }, previousStatus });
  const archived = update.status === 'archived' && community.status !== 'archived';
  emitCampusEvent(archived ? CAMPUS_EVENTS.COMMUNITY_ARCHIVED : CAMPUS_EVENTS.COMMUNITY_UPDATED, { communityId: community.id, actorId: viewer.id });
  return getCommunity(community.id, viewer);
}

/** DELETE archives: posts, members and media stay, joining and posting stop. Owners can restore it. */
export const archiveCommunity = (communityId, viewer) => updateCommunity(communityId, viewer, { status: 'archived' });

// ----------------------------------------------------------------------------- membership

/**
 * Joins a community. Checked in order: it exists and is active, the student isn't already in it or
 * removed from it, and their own college/branch/semester (from the database) fit its scope.
 */
export async function joinCommunity(communityId, viewer) {
  const community = await loadCommunity(communityId);
  // Held or removed communities aren't open to new members (they look like any community that isn't there).
  if (!inGoodStanding(community)) throw ApiError.notFound(COMMUNITY_NOT_FOUND);
  if (community.status !== 'active') throw ApiError.conflict('This community is archived, so it isn’t taking new members.');

  const existing = await membershipOf(community._id, viewer._id);
  if (existing?.status === 'active') throw ApiError.conflict('You’re already a member of this community.');
  if (existing?.status === 'banned') throw ApiError.forbidden('You were removed from this community, so you can’t rejoin it.');
  if (!scopeAllows(community, viewer)) throw ApiError.forbidden(scopeRefusal(community, await scopeLabels(community)));

  try {
    if (existing) {
      // Rejoining after leaving: only if nothing changed in between.
      const rejoined = await CommunityMember.findOneAndUpdate(
        { _id: existing._id, status: 'left' },
        { $set: { status: 'active', role: 'member', joinedAt: new Date(), removedBy: null } },
      );
      if (!rejoined) throw ApiError.conflict('You’re already a member of this community.');
    } else {
      await CommunityMember.create({ community: community._id, user: viewer._id, role: 'member' });
    }
  } catch (error) {
    // Two join requests at the same moment: the unique index lets one through.
    if (isDuplicateKey(error)) throw ApiError.conflict('You’re already a member of this community.');
    throw error;
  }

  await adjustMemberCount(community._id, 1);
  forgetMemberships(viewer);
  emitCampusEvent(CAMPUS_EVENTS.COMMUNITY_MEMBER_JOINED, { communityId: community.id, userId: viewer.id });
  return getCommunity(community.id, viewer);
}

/** Leaves a community. The last owner must hand over ownership (or archive it) first. */
export async function leaveCommunity(communityId, viewer) {
  const community = await loadCommunity(communityId);
  const membership = await membershipOf(community._id, viewer._id);
  if (membership?.status !== 'active') throw ApiError.conflict(NOT_A_MEMBER);

  if (membership.role === 'owner') {
    const otherOwners = await CommunityMember.countDocuments({ community: community._id, status: 'active', role: 'owner', user: { $ne: viewer._id } });
    if (otherOwners === 0) {
      throw ApiError.conflict('You’re the only owner. Make another member an owner first, or archive the community instead.');
    }
  }

  const left = await CommunityMember.findOneAndUpdate({ _id: membership._id, status: 'active' }, { $set: { status: 'left', role: 'member' } });
  if (!left) throw ApiError.conflict(NOT_A_MEMBER);
  await adjustMemberCount(community._id, -1);
  forgetMemberships(viewer);
  emitCampusEvent(CAMPUS_EVENTS.COMMUNITY_MEMBER_LEFT, { communityId: community.id, userId: viewer.id });
  return { id: community.id };
}

async function loadTargetMembership(community, userId) {
  const id = toObjectId(userId);
  const target = id ? await membershipOf(community._id, id) : null;
  if (target?.status !== 'active') throw ApiError.notFound('That student isn’t a member of this community.');
  return target;
}

/**
 * Owners change members' roles. An owner can't change another owner's role; an owner can step
 * down only while another owner remains. Nobody can promote themselves.
 */
export async function changeMemberRole(communityId, userId, viewer, role) {
  if (!MEMBER_ROLES.includes(role)) throw ApiError.unprocessable('Please choose a valid role.');
  const { community } = await loadForManagement(communityId, viewer, ['owner']);
  const target = await loadTargetMembership(community, userId);
  const isSelf = target.user.equals(viewer._id);

  if (isSelf) {
    if (role === 'owner') return listMemberView(community, target, viewer);
    const otherOwners = await CommunityMember.countDocuments({ community: community._id, status: 'active', role: 'owner', user: { $ne: viewer._id } });
    if (otherOwners === 0) throw ApiError.conflict('Make another member an owner before stepping down.');
  } else if (target.role === 'owner') {
    throw ApiError.forbidden('Owners can’t change another owner’s role.');
  }

  const updated = await CommunityMember.findOneAndUpdate(
    { _id: target._id, status: 'active' },
    { $set: { role } },
    { returnDocument: 'after' },
  );
  if (!updated) throw ApiError.notFound('That student isn’t a member of this community.');
  emitCampusEvent(CAMPUS_EVENTS.COMMUNITY_ROLE_CHANGED, { communityId: community.id, userId: updated.user.toString(), role, actorId: viewer.id });
  return listMemberView(community, updated, viewer);
}

async function listMemberView(community, membership, viewer) {
  const students = await getStudentSummaries([membership.user]);
  return {
    member: {
      student: students.get(membership.user.toString()) ?? null,
      role: membership.role,
      joinedAt: membership.joinedAt,
      isYou: membership.user.equals(viewer._id),
    },
  };
}

/**
 * Removes a member (they can't rejoin on their own). Owners remove members and moderators;
 * moderators remove members only. Owners can't be removed, and nobody removes themselves.
 */
export async function removeMember(communityId, userId, viewer) {
  const { community, membership } = await loadForManagement(communityId, viewer, ['owner', 'moderator']);
  const target = await loadTargetMembership(community, userId);

  if (target.user.equals(viewer._id)) throw ApiError.badRequest('Use “Leave community” to leave.');
  if (target.role === 'owner') throw ApiError.forbidden('Owners can’t be removed from their community.');
  if (target.role === 'moderator' && membership.role !== 'owner') throw ApiError.forbidden('Only owners can remove moderators.');

  const removed = await CommunityMember.findOneAndUpdate(
    { _id: target._id, status: 'active' },
    { $set: { status: 'banned', role: 'member', removedBy: viewer._id } },
  );
  if (!removed) throw ApiError.notFound('That student isn’t a member of this community.');
  await adjustMemberCount(community._id, -1);
  emitCampusEvent(CAMPUS_EVENTS.COMMUNITY_MEMBER_REMOVED, { communityId: community.id, userId: target.user.toString(), actorId: viewer.id });
  return { id: target.user.toString() };
}

/** Used before an icon/cover upload is read: only owners may change them. */
export async function assertCommunityOwner(communityId, viewer) {
  const { community } = await loadForManagement(communityId, viewer, ['owner']);
  if (community.official) throw ApiError.forbidden('Official CampusX communities can’t be edited.');
  return community;
}

// ----------------------------------------------------------------------------- options

const mediaRules = (presetName) => {
  const preset = MEDIA_PRESETS[presetName];
  return { maxBytes: preset.maxFileSize, maxMegabytes: preset.maxFileSize / BYTES_PER_MB, mimeTypes: preset.allowedMimeTypes };
};

/** Everything the communities screens need, from the same lists the server validates against. */
export function getCommunityOptions() {
  return {
    types: COMMUNITY_TYPES,
    visibility: COMMUNITY_VISIBILITY,
    visibilityForType: VISIBILITY_FOR_TYPE,
    filters: COMMUNITY_FILTERS,
    sorts: COMMUNITY_SORTS,
    roles: MEMBER_ROLES,
    rules: COMMUNITY_RULES,
    media: { icon: mediaRules('communityIcon'), cover: mediaRules('communityCover') },
  };
}

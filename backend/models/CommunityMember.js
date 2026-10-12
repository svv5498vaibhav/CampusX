import mongoose from 'mongoose';
import { watchIndexBuild } from '../config/db.js';
import { MEMBER_ROLES, MEMBER_STATUSES } from '../data/communityOptions.js';

const communityMemberSchema = new mongoose.Schema(
  {
    community: { type: mongoose.Schema.Types.ObjectId, ref: 'Community', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: MEMBER_ROLES, default: 'member' },
    status: { type: String, enum: MEMBER_STATUSES, default: 'active' },
    joinedAt: { type: Date, default: Date.now },
    // Who removed the student, when status is "banned".
    removedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

// One membership record per student per community (leaving or rejoining updates it).
communityMemberSchema.index({ community: 1, user: 1 }, { unique: true });
communityMemberSchema.index({ user: 1, status: 1 });
communityMemberSchema.index({ community: 1, status: 1, role: 1, joinedAt: 1 });

const CommunityMember = mongoose.model('CommunityMember', communityMemberSchema);
watchIndexBuild(CommunityMember);

export default CommunityMember;

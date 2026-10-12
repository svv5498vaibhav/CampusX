/**
 * Developer-only: change the role of an existing account.
 *
 *   npm run user:role -- --email student@college.edu --role admin
 *
 * The account must already exist (created through normal registration), so this script
 * never creates users or handles passwords. Public registration always creates students;
 * this is the only way to grant moderator/admin until an admin panel exists.
 * Refuses to run with NODE_ENV=production unless --allow-production is passed.
 */
import { parseArgs } from 'node:util';
import env from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import User, { ROLES } from '../models/User.js';
import { writeAudit } from '../services/moderationService.js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    role: { type: 'string' },
    'allow-production': { type: 'boolean', default: false },
  },
});

const fail = (message) => {
  console.error(`✖ ${message}`);
  process.exitCode = 1;
};

async function main() {
  const email = values.email?.trim().toLowerCase();
  const role = values.role?.trim().toLowerCase();
  const allowedRoles = Object.values(ROLES);

  if (env.isProduction && !values['allow-production']) {
    return fail('Refusing to change roles with NODE_ENV=production. Pass --allow-production if you really mean it.');
  }
  if (!email || !role) {
    return fail('Usage: npm run user:role -- --email <email> --role <student|moderator|admin>');
  }
  if (!allowedRoles.includes(role)) {
    return fail(`Unknown role "${role}". Use one of: ${allowedRoles.join(', ')}.`);
  }
  if (!env.mongodbUri) {
    return fail('MONGODB_URI is not set in backend/.env.');
  }

  await connectDatabase();
  try {
    const before = await User.findOneAndUpdate({ email }, { $set: { role } }, { returnDocument: 'before', projection: { role: 1 } });
    if (!before) return fail(`No account found for ${email}. Register it through the app first.`);
    if (before.role === role) {
      console.log(`✔ ${email} is already "${role}". Nothing changed.`);
      return undefined;
    }
    // Role changes are security-sensitive: recorded in the admin audit log (Users category) as a system action.
    await writeAudit({ action: 'ROLE_CHANGED', targetType: 'user', targetId: before._id, previousStatus: before.role, newStatus: role, metadata: { via: 'command_line' } });
    console.log(`✔ ${email} is now "${role}" (was "${before.role}"). Existing sessions pick up the new role on their next request; live staff alerts stop for a removed staff role.`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => fail(error.message));

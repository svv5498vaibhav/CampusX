import { query } from 'express-validator';
import { GAMIFICATION_RULES, RANKING_PERIOD_IDS } from '../data/gamificationOptions.js';
import { pageRules } from './showcaseRules.js';

/*
 * Leaderboards and point history are read-only, and always about the signed-in student's own scopes
 * and records. College, branch, semester or user ids in a query are not read (matchedData keeps only
 * the fields below).
 */

export const leaderboardRules = [
  ...pageRules(GAMIFICATION_RULES.leaderboardPageSize),
  query('period').default('all').isIn(RANKING_PERIOD_IDS).withMessage('Please choose all, month or week.'),
];

/** /rankings/weekly and /rankings/monthly fix the period themselves. */
export const fixedPeriodLeaderboardRules = pageRules(GAMIFICATION_RULES.leaderboardPageSize);

export const transactionsRules = pageRules(GAMIFICATION_RULES.transactionPageSize);

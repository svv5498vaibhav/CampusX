/*
 * Opportunity management in the control center reuses the Phase 8 handlers (controllers/opportunityController.js)
 * and services as they are: the same validation, the same responses, and one audit row per change
 * whichever route was used. The admin routes add the admin gate and the MANAGE_OPPORTUNITIES permission.
 */
export { createOpportunity, deleteOpportunity, listForStaff as listOpportunities, updateOpportunity } from '../opportunityController.js';

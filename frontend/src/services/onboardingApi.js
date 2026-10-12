import api from './api';

const unwrap = (response) => response.data.data;

export const onboardingApi = {
  getStatus: () => api.get('/onboarding/status').then(unwrap),
  /** Colleges, branches, semesters, interests, skill suggestions and limits. The API is the only source. */
  getOptions: () => api.get('/onboarding/options').then(unwrap),
  /** Saves the campus identity for the signed-in student and returns the updated user. */
  save: (details) => api.put('/onboarding', details).then(unwrap),
};

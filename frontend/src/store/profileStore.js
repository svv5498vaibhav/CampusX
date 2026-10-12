import { create } from 'zustand';
import { profileApi } from '@/services/profileApi';
import { useAuthStore } from '@/store/authStore';

/** Keeps the signed-in user (sidebar, menus) in step with the saved profile, without another request. */
function syncAuthUser(profile) {
  const { user, updateUser } = useAuthStore.getState();
  if (!user || user.id !== profile.id) return;
  updateUser({
    ...user,
    firstName: profile.firstName,
    lastName: profile.lastName,
    avatarUrl: profile.avatarUrl,
    coverImageUrl: profile.coverImageUrl,
    bio: profile.bio,
    skills: profile.skills,
    interests: profile.interests.map((interest) => interest.id),
    profileTheme: profile.theme,
    college: profile.college?.id ?? null,
    branch: profile.branch?.id ?? null,
    semester: profile.semester?.value ?? null,
    rollNumber: profile.rollNumber ?? user.rollNumber,
  });
}

const INITIAL_STATE = {
  ownProfile: null,
  ownStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
  ownError: '',
  viewedProfile: null,
  viewedStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'not-found' | 'error'
  viewedError: '',
  options: null,
  optionsStatus: 'idle',
  optionsError: '',
};

/**
 * Profile data for the UI. All API calls live here (and in services/profileApi.js), never in
 * components. Every change returns the saved profile, which replaces the local copy at once.
 */
export const useProfileStore = create((set, get) => {
  const saveOwn = (profile) => {
    set({ ownProfile: profile, ownStatus: 'ready', ownError: '' });
    syncAuthUser(profile);
    return profile;
  };

  return {
    ...INITIAL_STATE,

    fetchOwnProfile: async () => {
      set({ ownStatus: get().ownProfile ? 'ready' : 'loading', ownError: '' });
      try {
        return saveOwn(await profileApi.getOwnProfile());
      } catch (error) {
        set({ ownStatus: 'error', ownError: error.message });
        return null;
      }
    },

    fetchPublicProfile: async (userId) => {
      set({ viewedStatus: 'loading', viewedError: '', viewedProfile: null });
      try {
        const profile = await profileApi.getPublicProfile(userId);
        set({ viewedProfile: profile, viewedStatus: 'ready' });
        return profile;
      } catch (error) {
        set({ viewedStatus: error.status === 404 ? 'not-found' : 'error', viewedError: error.message });
        return null;
      }
    },

    loadOptions: async () => {
      if (['loading', 'ready'].includes(get().optionsStatus)) return;
      set({ optionsStatus: 'loading', optionsError: '' });
      try {
        set({ options: await profileApi.getOptions(), optionsStatus: 'ready' });
      } catch (error) {
        set({ optionsStatus: 'error', optionsError: error.message });
      }
    },

    // These reject with the API error (message + field errors) so forms can show it.
    updateProfile: async (changes) => saveOwn(await profileApi.updateProfile(changes)),
    uploadAvatar: async (file, onProgress) => saveOwn(await profileApi.uploadAvatar(file, { onProgress })),
    deleteAvatar: async () => saveOwn(await profileApi.deleteAvatar()),
    uploadCover: async (file, onProgress) => saveOwn(await profileApi.uploadCover(file, { onProgress })),
    deleteCover: async () => saveOwn(await profileApi.deleteCover()),

    reset: () => set(INITIAL_STATE),
  };
});

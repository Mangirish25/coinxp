import { apiFetch } from './api';
import { queryClient } from './queryClient';
import type { ProfileData } from '../types/profile';

function refresh() { void queryClient.invalidateQueries({ queryKey: ['profile'] }); }

export const profileApi = {
  get: () => apiFetch<ProfileData>('/api/profile'),
  saveShowcase(slugs: string[]) {
    return apiFetch<ProfileData>('/api/profile/showcase', { method: 'POST', body: JSON.stringify({ slugs }) }).then((result) => { refresh(); return result; });
  },
  equip(slot: 'THEME' | 'FRAME', itemSlug: string | null) {
    return apiFetch<ProfileData>('/api/profile/equip', { method: 'POST', body: JSON.stringify({ slot, itemSlug }) }).then((result) => { refresh(); return result; });
  },
};

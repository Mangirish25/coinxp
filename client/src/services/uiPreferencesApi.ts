import { apiFetch } from './api';
import type { UiPreferences } from '../types/uiPreferences';

export const uiPreferencesApi = {
  get: () => apiFetch<UiPreferences>('/api/ui/preferences'),
  save: (preferences: Omit<UiPreferences, 'updatedAt'>) => apiFetch<UiPreferences>('/api/ui/preferences', {
    method: 'PUT', body: JSON.stringify(preferences),
  }),
};

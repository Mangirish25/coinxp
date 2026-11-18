import { apiFetch } from './api';
import type { ActivityPage, NotificationPreference } from '../types/activity';

export const activityApi = {
  list: (cursor?:string|null) => apiFetch<ActivityPage>(`/api/activity?pageSize=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
  preferences: () => apiFetch<{preferences:NotificationPreference[]}>('/api/notifications/preferences'),
  savePreferences: (preferences:Pick<NotificationPreference,'category'|'enabled'>[]) => apiFetch<{preferences:NotificationPreference[]}>('/api/notifications/preferences',{method:'PUT',body:JSON.stringify({preferences})}),
};

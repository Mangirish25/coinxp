import { apiFetch } from './api';
import type { FreezeHistory, StreakCalendar, StreakSummary } from '../types/streak';

export const streakApi = {
  summary: () => apiFetch<StreakSummary>('/api/streaks'),
  calendar(from: string, to: string) {
    const params = new URLSearchParams({ from, to });
    return apiFetch<StreakCalendar>(`/api/streaks/tracking/calendar?${params}`);
  },
  freezes(page = 1, pageSize = 20) {
    return apiFetch<FreezeHistory>(`/api/streaks/freezes?page=${page}&pageSize=${pageSize}`);
  },
  rules: () => apiFetch<Record<string, unknown>>('/api/streaks/rules'),
};

import { apiFetch } from './api';
import type { MissionList } from '../types/mission';

export const missionApi = {
  current: () => apiFetch<MissionList>('/api/missions'),
};

import { apiFetch } from './api';
import { queryClient } from './queryClient';
import type { MissionList } from '../types/mission';

export const missionApi = {
  current: () => apiFetch<MissionList>('/api/missions'),
  reroll(slot: 'DAILY' | 'WEEKLY' | 'MONTHLY') {
    return apiFetch('/api/missions/' + slot.toLowerCase() + '/reroll', { method: 'POST', body: '{}' }).then((result) => {
      void queryClient.invalidateQueries({ queryKey: ['missions'] });
      return result;
    });
  },
};
